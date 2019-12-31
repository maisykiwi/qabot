const inits = () => `https://team.usetrace.com/rpc/app/init`;

const postProject = (id) => `https://api.usetrace.com/api/project/${id}/execute_all`;

const checkResultReady = (batch_id) => `https://api.usetrace.com/api/results/${batch_id}/xunit`;

const postTrace = (traceId) => `https://api.usetrace.com/api/trace/${traceId}/execute`;

const flushProject = (projectId) => `https://api.usetrace.com/api/queue/${projectId}/flush`;

exports.inits = inits;
exports.postProject = postProject;
exports.checkResultReady = checkResultReady;
exports.postTrace = postTrace;
exports.flushProject = flushProject;