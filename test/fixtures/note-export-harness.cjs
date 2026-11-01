const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {createRequire}=require("node:module");
const root=path.resolve(__dirname,"../..");

function loadEnvironment(config={}) {
  const vscode={workspace:{getConfiguration:()=>({get:(key,fallback)=>config[key]??fallback})}};
  function load(relative) {
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,relative),"utf8"),{
      module,require:request=>request==="vscode"?vscode:{},
    });
    return module.exports;
  }
  return {getEffectiveExportOptions:load("src/export/export-utils.js").getEffectiveExportOptions,
    getGenreDisplayText:load("src/data/settings-store.js").getGenreDisplayText};
}

function createHarness(options={}) {
  const notes=options.notes||{
    plot:[{title:"プロット",updatedAt:"2026-10-19T00:12:00Z",groups:[{title:"分類",items:[
      {id:"a",kind:"divider",label:"区分",value:"補足\n続き"},
      {id:"b",kind:"entry",heading:"人物",furigana:"じんぶつ",body:'｜国《くに》と《《強調》》 <script>文字列</script> , "引用"',
        memo:{body:"メモ本文\n次の行",type:"list",tags:["資料","<タグ>"],linkedConceptMemoIds:["private-id"]}},
    ]}]}], reference:[{title:"資料",groups:[{title:"設定",items:[{kind:"entry",heading:"城",body:"資料本文"}]}]}],
  };
  const settings=options.settings||{title:"作品",folderName:"work",subtitle:"補助",genres:["幻想","冒険"],summary:"あらすじ",memo:"設定メモ",updatedAt:"2026-10-19T00:12:00Z"};
  const environment=loadEnvironment(options.config), writes=[],events=[],picks=[];
  const byPath=new Map(),metas={};
  for(const type of ["plot","reference"])metas[type]=(notes[type]||[]).map((note,i)=>{
    const fsPath=path.join(root,".review-baseline","virtual",type,`${i}.json`);byPath.set(fsPath,note);return {fsPath,title:note.title};
  });
  const item={kind:"work",workDir:"virtual-work",fsPath:"virtual-work",workName:"work",workTitle:settings.title||"作品"};
  const vscode={Uri:{file:fsPath=>({fsPath})},commands:{executeCommand:async(...args)=>events.push(["command",...args])},window:{
    async showQuickPick(items,selection={}) {
      picks.push(selection.title);
      if(options.cancelTitle&&selection.title.includes(options.cancelTitle))return undefined;
      if(selection.canPickMany)return items;
      if(items.some(value=>value.value===options.format))return items.find(value=>value.value===options.format);
      if(items.some(value=>value.value==="all"))return items.find(value=>value.value==="all");
      if(items.some(value=>value.value===true))return items.find(value=>value.value===(selection.title.includes("項目メモ")?options.includeItemMemos===true:options.includeSettings!==false));
      throw Error("Unexpected selection: "+selection.title);
    },showInformationMessage:async()=>options.action,
  }};
  function load(file,source) {
    const module={exports:{}},localRequire=createRequire(file);
    vm.runInNewContext(source||fs.readFileSync(file,"utf8"),{module,Date:class extends Date{constructor(...args){super(...(args.length?args:["2026-10-19T00:00:00Z"]));}},require(request){
      if(request==="vscode")return vscode;
      if(request==="fs/promises")return {writeFile:async(...args)=>writes.push(args)};
      if(request==="../data/note-store")return {readNoteFile:async file=>byPath.get(file),listNotesWithMeta:async type=>metas[type]};
      if(request==="../data/settings-store")return {...environment,resolveSettingsTarget:async()=>({path:"virtual-settings"}),readSettingsFile:async()=>settings};
      if(request==="./export-utils")return {...environment,ensureNamedExportDir:async(...args)=>{events.push(["directory",...args]);return "virtual-export";},resolveExportDirForTarget:async(...args)=>{events.push(["directory",...args]);return "virtual-export";}};
      if(request==="../core/mojigoto-context")return {isSingleMode:()=>true};
      if(request==="../core/mojigoto-paths")return {resolveTargetWorkContext:value=>value};
      return localRequire(request);
    }},{filename:file});
    return module.exports;
  }
  const single=load(path.join(root,"src/export/export-service.js"),options.singleSource);
  const bundle=load(path.join(root,"src/export/export-bundle-service.js"),options.bundleSource);
  async function run(kind) {
    if(kind==="single")return single.exportTreeItem({}, {...item,kind:"noteFile",noteType:"plot",fsPath:metas.plot[0].fsPath});
    if(kind==="settings")return single.exportTreeItem({}, {...item,kind:"settingsEntry"});
    if(kind==="view")return bundle.exportViewBundle({},item);
    if(kind==="work")return bundle.exportTargetWorkBundle({},item);
    if(kind==="plot"||kind==="reference")return bundle.exportNoteTypeBundle({},item,kind);
    throw Error("Unknown export kind: "+kind);
  }
  return {environment,settings,notes,writes,events,picks,single,bundle,run};
}
module.exports={createHarness,loadEnvironment};
