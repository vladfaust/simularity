import chalk from "chalk";

chalk.level = 2;

function debug(...args: any[]) {
  console.debug(chalk.gray("[D]"), ...args);
}

function log(...args: any[]) {
  console.log(chalk.cyan("[L]"), ...args);
}

function info(...args: any[]) {
  console.info(chalk.cyan("[I]"), ...args);
}

function warn(...args: any[]) {
  console.warn(chalk.yellow("[W]"), ...args);
}

function error(...args: any[]) {
  console.error(chalk.red("[W]"), ...args);
}

export const konsole = {
  debug,
  log,
  info,
  warn,
  error,
};
