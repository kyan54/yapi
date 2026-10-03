const yapi = require('yapi.js');
const baseModel = require('models/base.js');

class advMockModel extends baseModel {
  getName() {
    return 'adv_mock';
  }

  getSchema() {
    return {
      interface_id: { type: Number, required: true },
      project_id: {type: Number, required: true},
      enable: {type: Boolean, default: false}, 
      mock_script: String,
      uid: String,
      up_time: Number
    };
  }

  get(interface_id) {

    return this.model.findOne({
      interface_id: interface_id
    });
  }

  delByInterfaceId(interface_id) {
    return this.removeDocuments({
      interface_id: interface_id
    });
  }

  delByProjectId(project_id){
    return this.removeDocuments({
      project_id: project_id
    })
  }

  save(data) {
    data.up_time = yapi.commons.time();
    let m = new this.model(data);
    return m.save();
  }

  up(data) {
    data = Object.assign({}, data);
    data.up_time = yapi.commons.time();
    return this.updateDocuments({
      interface_id: data.interface_id,
      project_id: data.project_id
    }, {
        uid: data.uid,
        up_time: data.up_time,
        mock_script: data.mock_script,
        enable: data.enable
      }, {
        upsert: true
      })
  }

}

module.exports = advMockModel;