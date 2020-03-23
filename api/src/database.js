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

// ====== insert datadog failures ======
const insertDatadogFailures = async (public_id_arr) => {
    return new Promise(function (resolve, error) {
        const statement = `INSERT INTO datadog_rerun(public_id_arr) ` +
            `VALUES ("${public_id_arr}");`;

        db.query(statement, function (e, result) {
            if (e) {
                error(e);
            }
            resolve(result);
        })
    });
}


// ====== get datadog failures ==========
const getDatadogFailures = async () => {
    return new Promise(function (resolve, error) {
        const statement = `select * from datadog_rerun ORDER BY id DESC LIMIT 1;`;

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
exports.insertDatadogFailures = insertDatadogFailures;
exports.getDatadogFailures = getDatadogFailures;