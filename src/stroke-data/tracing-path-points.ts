/** Decode SVG linear path commands without treating control values as coordinates. @implements SPEC-FM-TRACING-GROUPS */
export function tracingPathPoints(path: string): number[][] {
  const pattern=/[MmLlHhVv]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const tokens=path.match(pattern)??[];
  if(path.replace(pattern,"").replace(/[\s,]/g,"") || tokens.length>16384) throw new Error("Unsupported tracing path syntax");
  const result:number[][]=[];
  let index=0,command="",x=0,y=0;
  const number=():number=>{
    const token=tokens[index++];
    if(token===undefined || /^[a-z]$/i.test(token) || !Number.isFinite(Number(token))) throw new Error("Missing path coordinate");
    return Number(token);
  };
  while(index<tokens.length){
    if(/^[a-z]$/i.test(tokens[index])) command=tokens[index++];
    if(!command || !result.length && command.toUpperCase()!=="M") throw new Error("Path must begin with move");
    const relative=command===command.toLowerCase(), upper=command.toUpperCase();
    if(upper==="M" && result.length) throw new Error("Multiple tracing subpaths");
    if(upper==="M" || upper==="L"){
      const a=number(),b=number();x=(relative?x:0)+a;y=(relative?y:0)+b;
      if(upper==="M") command=relative?"l":"L";
    }else if(upper==="H") x=(relative?x:0)+number();
    else if(upper==="V") y=(relative?y:0)+number();
    else throw new Error("Unsupported tracing command");
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1024||y<0||y>1024) throw new Error("Primary tracing path leaves the glyph box");
    result.push([x,y]);
    if(result.length>4096) throw new Error("Tracing path too long");
  }
  if(result.length<2) throw new Error("Tracing path too short");
  return result;
}
