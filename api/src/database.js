const insertJob = async (batch_id, project_id, project_name, channel, reply_ts) => {
    return new Promise(function (resolve, error) {
        const statement = `INSERT INTO usetrace_jobs(batch_id, project_id, project_name, channel, reply_thread, type) ` +
            `VALUES ("${batch_id}","${project_id}","${project_name}", "${channel}","${reply_ts}","project");`;

        db.query(statement, function (e, result) {
            if (e) {
                error(e);
            }
            console.log("Insert result: ", result);
            resolve(result);
        })
    });
};

const getRerunProjectName = async (name) => {
    return new Promise(function (resolve, error) {
        const statement = `select * from usetrace_rerun where project_name = "${name}";`;

        db.query(statement, function (e, result) {
            if (e) {
                error(e);
            }
            resolve(result);
        })
    })
}

exports.insertJob = insertJob;
exports.getRerunProjectName = getRerunProjectName;