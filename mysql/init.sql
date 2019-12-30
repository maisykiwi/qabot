/***CLEAN UP TABLES IF EXIST*/
DROP TABLE IF EXISTS `usetrace_jobs`;

/***CREATING ALL TABLES*/
CREATE TABLE `usetrace_jobs`(
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `channel` VARCHAR(500) NOT NULL,
  `reply_thread` VARCHAR(500) NOT NULL,
  `project_name` VARCHAR(1000) NOT NULL,
  `project_id` VARCHAR(500) NOT NULL,
  `batch_id` VARCHAR(500) NOT NULL,
  `type` VARCHAR(200) NOT NULL,
  `trace_id` VARCHAR(500),
  `finished` INT DEFAULT '0'
) 
ENGINE = INNODB;

CREATE TABLE `usetrace_rerun`(
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `project_name` VARCHAR(1000) NOT NULL,
  `project_id` VARCHAR(500) NOT NULL,
  `trace_name` VARCHAR(1000) NOT NULL,
  `trace_id` VARCHAR(500) NOT NULL,
  `reply_thread` VARCHAR(500),
  `channel` VARCHAR(500),
  `new_batch_id` VARCHAR(500),
  `started` INT DEFAULT '0',
  `passed` INT DEFAULT '0',
  `finished` INT DEFAULT '0'
) 
ENGINE = INNODB;



