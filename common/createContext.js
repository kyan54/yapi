module.exports = function (uid, projectId,interfaceId, extra = {}) {
  if(!uid || !projectId || !interfaceId){
    console.error('uid projectId interfaceId 不能为空', uid, projectId,interfaceId)
  }

  /**
   * 统一转换为number
   */
  return Object.assign({
    uid: +uid,
    projectId: +projectId,
    interfaceId: +interfaceId
  }, extra)
}
