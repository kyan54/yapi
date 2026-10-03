'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '..');

function load(relative, dependencies, jsx = false) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name);
  let source = fs.readFileSync(filename, 'utf8');
  if (jsx) source = require('@babel/core').transformSync(source, {
    filename, babelrc: false, configFile: false,
    presets: [['@babel/preset-env', { targets: { node: '24' } }], '@babel/preset-react']
  }).code;
  loaded._compile(source, filename);
  return loaded.exports;
}

const Stats = load('exts/yapi-plugin-statistics/statisMockModel.js', {
  'yapi.js': {}, 'models/base.js': class {}
});

test('statistics day aggregation uses the Mongoose 9 cursor API and preserves its pipeline', async () => {
  const rows = [{ _id: '2026-10-01', count: 3 }, { _id: '2026-10-02', count: 1 }];
  let pipeline, cursorOptions;
  const stats = new Stats();
  stats.model = { aggregate(value) {
    pipeline = value;
    return { cursor(options) {
      cursorOptions = options;
      // Mongoose 9 cursors expose eachAsync directly and no longer expose exec.
      return { eachAsync: async callback => { for (const row of rows) await callback(row); } };
    } };
  } };
  assert.deepEqual(await stats.getDayCount(['2026-09-30', '2026-10-02']), rows);
  assert.deepEqual(cursorOptions, {});
  assert.deepEqual(pipeline, [
    { $match: { date: { $gt: '2026-09-30', $lte: '2026-10-02' } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
});

test('statistics aggregation preserves empty results and propagates cursor failures', async () => {
  const stats = new Stats();
  stats.model = { aggregate: () => ({ cursor: () => ({ eachAsync: async () => {} }) }) };
  assert.deepEqual(await stats.getDayCount(['start', 'end']), []);
  stats.model = { aggregate: () => ({ cursor: () => ({ eachAsync: async () => { throw new Error('synthetic database error'); } }) }) };
  await assert.rejects(stats.getDayCount(['start', 'end']), /synthetic database error/);
});

function chart(get) {
  const Chart = load('exts/yapi-plugin-statistics/statisticsClientPage/StatisChart.js', {
    axios: { get },
    recharts: Object.fromEntries(['LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend'].map(name => [name, name])),
    antd: { Alert: 'Alert', Button: 'Button', Spin: 'Spin' }
  }, true).default;
  const instance = new Chart({});
  instance.mounted = true;
  // Exercise the actual class's request/state lifecycle without claiming layout validation.
  instance.setState = update => { instance.state = { ...instance.state, ...update }; };
  return instance;
}

test('statistics chart exits loading and retains a genuine empty dataset', async () => {
  const data = { mockCount: 0, mockDateList: [] };
  const instance = chart(async () => ({ data: { errcode: 0, data } }));
  await instance.getMockData();
  assert.equal(instance.state.showLoading, false);
  assert.equal(instance.state.loadError, false);
  assert.deepEqual(instance.state.chartDate, data);
  assert.equal(instance.render().props.children[0], false);
});

test('statistics chart surfaces HTTP, application and malformed-data failures and can retry', async () => {
  const failures = [
    async () => { throw new Error('synthetic network failure'); },
    async () => ({ data: { errcode: 400, errmsg: 'synthetic application failure' } }),
    async () => ({ data: { errcode: 0, data: { mockCount: 'bad', mockDateList: [] } } }),
    async () => ({ data: { errcode: 0, data: { mockCount: 0, mockDateList: null } } })
  ];
  for (const failure of failures) {
    let fail = true;
    const data = { mockCount: 7, mockDateList: [{ _id: '2026-10-02', count: 7 }] };
    const instance = chart(() => fail ? failure() : Promise.resolve({ data: { errcode: 0, data } }));
    await instance.getMockData();
    assert.equal(instance.state.showLoading, false);
    assert.equal(instance.state.loadError, true);
    const alert = instance.render().props.children[0];
    assert.equal(alert.props.message, 'Mock 统计加载失败');
    assert.equal(alert.props.action.props.children, '重试');
    fail = false;
    await alert.props.action.props.onClick();
    assert.equal(instance.state.loadError, false);
    assert.deepEqual(instance.state.chartDate, data);
  }
});

test('statistics chart ignores stale, repeated and post-unmount request completions', async () => {
  const pending = [];
  const instance = chart(() => new Promise(resolve => pending.push(resolve)));
  const first = instance.getMockData();
  const second = instance.getMockData();
  pending[1]({ data: { errcode: 0, data: { mockCount: 2, mockDateList: [] } } });
  await second;
  pending[0]({ data: { errcode: 0, data: { mockCount: 1, mockDateList: [] } } });
  await first;
  assert.equal(instance.state.chartDate.mockCount, 2);
  const third = instance.getMockData();
  instance.componentWillUnmount();
  const state = instance.state;
  pending[2]({ data: { errcode: 0, data: { mockCount: 3, mockDateList: [] } } });
  await third;
  assert.equal(instance.state, state);
});

test('statistics aggregation reads real persisted rows, date boundaries and empty ranges', {
  skip: !process.env.YAPI_TEST_MONGO_URI && 'Requires disposable MongoDB; cursor/state unit coverage is not database acceptance.'
}, async () => {
  const dbName = 'yapi_stats_test_' + process.pid + '_' + Date.now();
  const connection = await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI,
    { dbName, serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    const model = connection.model('statis_mock', new mongoose.Schema({ date: String }), 'statis_mock');
    await model.insertMany([{ date: '2026-09-30' }, { date: '2026-10-01' }, { date: '2026-10-01' }, { date: '2026-10-02' }, { date: '2026-10-03' }]);
    const stats = new Stats();
    stats.model = model;
    assert.deepEqual(await stats.getDayCount(['2026-09-30', '2026-10-02']), [
      { _id: '2026-10-01', count: 2 }, { _id: '2026-10-02', count: 1 }
    ]);
    assert.deepEqual(await stats.getDayCount(['2026-10-03', '2026-10-04']), []);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
