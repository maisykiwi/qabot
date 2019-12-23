const getNames = () => `https://team.usetrace.com/rpc/app/init`;

const postProject = (id) => `https://api.usetrace.com/api/project/${id}/execute_all`;

const checkResultReady = (batch_id) => `https://api.usetrace.com/api/results/${batch_id}/xunit`;

exports.getNames = getNames;
exports.postProject = postProject;
exports.checkResultReady = checkResultReady;