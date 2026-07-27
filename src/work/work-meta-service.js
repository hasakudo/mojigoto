async function setCurrentWorkName(context, workName) {
  await context.globalState.update("mojigoto.currentWorkName", workName);
}

function getCurrentWorkName(context) {
  return String(context.globalState.get("mojigoto.currentWorkName", "") || "");
}

module.exports = {
  setCurrentWorkName,
  getCurrentWorkName,
};
