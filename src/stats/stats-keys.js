function normalizeStatsWorkScope(workName) {
  return String(workName || "").trim() || "default";
}

function getStatsWorkScope(context) {
  return normalizeStatsWorkScope(
    context.globalState.get("mojigoto.currentWorkName", "") || "default",
  );
}

function keyDaily(context) {
  return keyDailyByWorkName(getStatsWorkScope(context));
}

function keyFiles(context) {
  return keyFilesByWorkName(getStatsWorkScope(context));
}

function keyEvents(context) {
  return keyEventsByWorkName(getStatsWorkScope(context));
}

function keyEventsLastSendAt(context) {
  return keyEventsLastSendAtByWorkName(getStatsWorkScope(context));
}

function keyEventsLastRemindAt(context) {
  return keyEventsLastRemindAtByWorkName(getStatsWorkScope(context));
}

function keyEventsLastLoggedAt(context) {
  return keyEventsLastLoggedAtByWorkName(getStatsWorkScope(context));
}

function keyDailyByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.daily`;
}

function keyFilesByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.files`;
}

function keyEventsByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.events`;
}

function keyEventsLastSendAtByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.eventsLastSendAt`;
}

function keyEventsLastRemindAtByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.eventsLastRemindAt`;
}

function keyEventsLastLoggedAtByWorkName(workName) {
  return `mojigoto.stats.${normalizeStatsWorkScope(workName)}.eventsLastLoggedAt`;
}

module.exports = {
  normalizeStatsWorkScope,
  getStatsWorkScope,
  keyDaily,
  keyFiles,
  keyEvents,
  keyEventsLastSendAt,
  keyEventsLastRemindAt,
  keyEventsLastLoggedAt,
  keyDailyByWorkName,
  keyFilesByWorkName,
  keyEventsByWorkName,
  keyEventsLastSendAtByWorkName,
  keyEventsLastRemindAtByWorkName,
  keyEventsLastLoggedAtByWorkName,
};
