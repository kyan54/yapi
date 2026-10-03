const yapi = require('yapi.js');
const baseModel = require('models/base.js');
const  mongoose = require('mongoose');

class caseModel extends baseModel {
  getName() {
    return 'adv_mock_case';
  }

  getSchema() {
    return {
      interface_id: { type: Number, required: true },
      project_id: {type: Number, required: true},
      ip: {type: String},
      ip_enable: {type: Boolean,  default: false},
      name: {type: String, required: true},
      code: {type: Number, default: 200},
      delay: {type: Number,  default: 0},
      headers: [{
        name: {type: String, required: true},
        value: {type: String}
      }],
      params: mongoose.Schema.Types.Mixed,
      uid: String,
      up_time: Number,
      res_body: {type: String, required: true},
      case_enable: {type: Boolean,  default: true}
    };
  }

  get(data) {
    return this.model.findOne(data);
  }

  list(id){
    return this.model.find({
      interface_id: id
    })
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

  up(data, scope = {}) {
    data = Object.assign({}, data);
    let id = data.id;
    delete data.id;
    data.up_time = yapi.commons.time();
    return this.updateDocuments(Object.assign({ _id: id }, scope), data)
  }

  del(id, scope = {}){
    return this.removeDocuments(Object.assign({ _id: id }, scope))
  }

}

module.exports = caseModel;