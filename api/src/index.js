const SlackBot = require("slackbots");
const config = require("./config");
const lib = require("./usetrace_lib");
const cron = require("node-cron");
const checkTestStatus = require("./cron-job");
const mysql = require("mysql");
const query = require("./database");

const db = mysql.createConnection({
  host: process.env["DATABASE_HOST"],
  user: process.env["DATABASE_USER"],
  password: process.env["DATABASE_PASS"],
  database: process.env["DATABASE_DB"],
  port: process.env["DATABASE_PORT"]
});

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log("Connected to database");
});
global.db = db;

const bot = new SlackBot({
  token: config.TOKEN,
  name: "utbot"
});

cron.schedule("10 * * * * *", function () {
  checkTestStatus(bot, db);
});

bot.on("start", () => {
  console.log("utbot started!");
});

bot.on("error", err => console.log("Error: ", err));

bot.on("message", data => {
  if (data.type !== "message") {
    return;
  }

  if (
    data.subtype &&
    (data.subtype === "message_replied" || data.subtype === "bot_message")
  ) {
    return;
  }

  if (data.username && data.username === "utbot") {
    return;
  }

  if (!data.text) {
    return;
  }

  let cleaned = data.text.split(" ");
  if (cleaned.length < 2) {
    return;
  }

  cleaned = cleaned.slice(1);

  let action = cleaned[0];
  let reply_ts = data.ts;

  if (data.thread_ts) {
    reply_ts = data.thread_ts;
  }

  switch (action.toLowerCase()) {
    case "help":
      break;
    case "run":
      let name = cleaned.slice(1);
      name = name.join(" ").trim();
      runProject(name, data.channel, reply_ts);
      break;
    case "project":
    case "projects":
      getAllProjects(data.channel, reply_ts);
      break;
    default:
      invalidAction(data.channel, reply_ts);
      break;
  }
});

function helpMenu(name, channel, reply_ts) {
  console.log("show help menu");
}

const runProject = async (name, channel, reply_ts) => {
  const map = await lib.getProjectMap();
  const params = {
    thread_ts: reply_ts
  };
  if (map.has(name)) {
    const project_id = map.get(name);
    try {
      const resp = await lib.runProjectById(project_id);
      await query.insertJob(resp, project_id, name, channel, reply_ts);

      bot.postMessage(
        channel,
        `Started project ${name} \nbatch id: ${resp}`,
        params
      );
    } catch (e) {
      bot.postMessage(channel, `Error: ${e}`, params);
    }
  } else {
    bot.postMessage(channel, "Invalid project name", params);
  }
};

function invalidAction(channel, reply_ts) {
  const params = {
    thread_ts: reply_ts
  };
  bot.postMessage(channel, "invalid action", params);
}

const getAllProjects = async (channel, reply_ts) => {
  const msg = await lib.getProjectNames();
  const params = {
    thread_ts: reply_ts
  };
  bot.postMessage(channel, msg, params);
};