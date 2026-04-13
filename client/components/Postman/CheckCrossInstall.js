import React from 'react';
import PropTypes from 'prop-types';

exports.initCrossRequest = function(fn) {
  fn(true);
  return null;
};

CheckCrossInstall.propTypes = {
  hasPlugin: PropTypes.bool
};

function CheckCrossInstall() {
  return null;
}

export default CheckCrossInstall;
