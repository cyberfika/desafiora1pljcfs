let nodeBudgetMax = 5000;  // máximo de nós permitidos na expansão
let nodeBudget = nodeBudgetMax;

function budgetGuard(tag=''){
  if (--nodeBudget <= 0) {
    throw new Error('A fórmula ficou grande demais ao expandir ('+tag+').');
  }
}

function mjReady() {
  if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
    return MathJax.startup.promise;
  }
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        clearInterval(iv);
        resolve(MathJax.startup.promise);
      }
    }, 30);
  });
}

async function displayFormula(elementId, latex) {
  const el = document.getElementById(elementId);
  const errBox = document.getElementById('error-display');
  if (errBox) { errBox.style.display = 'none'; errBox.innerHTML = ''; }

  el.innerHTML = `$$${latex}$$`;
  try {
    await mjReady();
    MathJax.typesetClear && MathJax.typesetClear([el]);
    await MathJax.typesetPromise([el]);
  } catch (e) {
    console.error(e);
    if (errBox) {
      errBox.innerHTML = `<div class="error">Erro na renderização matemática. Verifique a sintaxe LaTeX.</div>`;
      errBox.style.display = 'block';
    }
    el.innerHTML = `<code>${latex.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`;
  }
}

/* =========================
   Lexer + Parser (AST) - CORRIGIDO
   Suporta: \forall \exists \neg \land \lor \to \leftrightarrow
            predicados/funções P(x), R(f(a),y), igualdade (=)
   ========================= */
const TK = {
  FORALL: 'FORALL', EXISTS: 'EXISTS', NOT: 'NOT',
  AND: 'AND', OR: 'OR', IMPLIES: 'IMPLIES', IFF: 'IFF',
  LP: 'LP', RP: 'RP', COMMA: 'COMMA', DOT: 'DOT',
  EQ: 'EQ', NAME: 'NAME'
};

function normalizeLatex(input) {
  let s = input;

  // 0) tira $$ se o usuário colar com delimitadores
  s = s.replace(/\$/g, '');

  // 1) conectivos/quantificadores LaTeX -> símbolos internos
  s = s
    .replace(/\\forall/g, '∀')
    .replace(/\\exists/g, '∃')
    .replace(/\\neg|\\lnot/g, '¬')
    .replace(/\\land|\\wedge/g, '∧')
    .replace(/\\lor|\\vee/g, '∨')
    .replace(/\\to|\\rightarrow|\\implies/g, '→')
    .replace(/\\leftrightarrow|\\iff/g, '↔');

  // 2) qualidade de vida — constantes lógicas e comparadores (opcional)
  // Obs.: Top/Bot serão interpretados como predicados 0-ários (átomos) pelo parser.
  s = s
    .replace(/\\top/g, 'Top')
    .replace(/\\bot/g, 'Bot')
    .replace(/\\neq/g, 'NEQ')
    .replace(/\\leq/g, 'LE')
    .replace(/\\geq/g, 'GE');

  // 3) suportar variantes ASCII rápidas (opcional)
  // ->, <->, ~, &, |
  s = s
    .replace(/\<\-\>/g, '↔')
    .replace(/\-\>/g, '→')
    .replace(/\~/g, '¬')
    .replace(/\|/g, '∨')
    .replace(/\&/g, '∧');

  // 4) remover comandos de espaçamento/tamanho típicos
  s = s.replace(/\\[,;:! ]/g, ' ');  // \, \; \: \! e '\ '
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\bigl|\\bigr|\\Bigl|\\Bigr|\\biggl|\\biggr|\\Biggl|\\Biggr/g, '');

  // 5) chaves de agrupamento e espaços
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}


function tokenize(input) {
  const s = normalizeLatex(input);

  const toks = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (c === '∀') { toks.push({ t: TK.FORALL, v: '∀' }); i++; continue; }
    if (c === '∃') { toks.push({ t: TK.EXISTS, v: '∃' }); i++; continue; }
    if (c === '¬') { toks.push({ t: TK.NOT, v: '¬' }); i++; continue; }
    if (c === '∧') { toks.push({ t: TK.AND, v: '∧' }); i++; continue; }
    if (c === '∨') { toks.push({ t: TK.OR, v: '∨' }); i++; continue; }
    if (c === '→') { toks.push({ t: TK.IMPLIES, v: '→' }); i++; continue; }
    if (c === '↔') { toks.push({ t: TK.IFF, v: '↔' }); i++; continue; }
    if (c === '(') { toks.push({ t: TK.LP, v: '(' }); i++; continue; }
    if (c === ')') { toks.push({ t: TK.RP, v: ')' }); i++; continue; }
    if (c === ',') { toks.push({ t: TK.COMMA, v: ',' }); i++; continue; }
    if (c === '.') { toks.push({ t: TK.DOT, v: '.' }); i++; continue; }
    if (c === '=') { toks.push({ t: TK.EQ, v: '=' }); i++; continue; }

    const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (m) { toks.push({ t: TK.NAME, v: m[0] }); i += m[0].length; continue; }

    throw new Error(`Token inválido perto de "${s.slice(i, Math.min(s.length, i + 10))}"`);
  }
  return toks;
}

// AST nodes
const Node = {
  Var:(name)=>({k:'Var',name}),
  Const:(name)=>({k:'Const',name}),
  Func:(name,args)=>({k:'Func',name,args}),
  Pred:(name,args)=>({k:'Pred',name,args}),
  Eq:(l,r)=>({k:'Eq',l,r}),
  Not:(f)=>({k:'Not',f}),
  And:(l,r)=>({k:'And',l,r}),
  Or:(l,r)=>({k:'Or',l,r}),
  Implies:(l,r)=>({k:'Implies',l,r}),
  Iff:(l,r)=>({k:'Iff',l,r}),
  Forall:(v,f)=>({k:'Forall',v,f}),
  Exists:(v,f)=>({k:'Exists',v,f}),
};

function Parser(tokens){
  let i=0;
  const peek=()=>tokens[i];
  const eat=(t)=>{ 
    const x=peek(); 
    if(!x||x.t!==t) throw new Error(`Esperado ${t}, encontrado ${x ? x.t : 'EOF'}`); 
    i++; 
    return x; 
  };

  function parseTerm(){
    const n = eat(TK.NAME).v;
    if (peek() && peek().t===TK.LP){
      eat(TK.LP);
      const args=[];
      if (peek().t!==TK.RP){
        args.push(parseTermLike());
        while (peek() && peek().t===TK.COMMA){ 
          eat(TK.COMMA); 
          args.push(parseTermLike()); 
        }
      }
      eat(TK.RP);
      return Node.Func(n,args);
    }
    // Heurística: nomes minúsculos = variáveis; maiúsculos = constantes
    return /^[a-z]/.test(n) ? Node.Var(n) : Node.Const(n);
  }

  function parseTermLike(){
    // termo ou igualdade em nível de átomo
    const left = parseTerm();
    if (peek() && peek().t===TK.EQ){
      eat(TK.EQ);
      const right = parseTerm();
      return Node.Eq(left,right);
    }
    return left;
  }

  function parseAtom(){
    if (peek() && peek().t===TK.NAME){
      const n = eat(TK.NAME).v;
      if (peek() && peek().t===TK.LP){
        eat(TK.LP);
        const args=[];
        if (peek().t!==TK.RP){
          args.push(parseTermLike());
          while (peek() && peek().t===TK.COMMA){ 
            eat(TK.COMMA); 
            args.push(parseTermLike()); 
          }
        }
        eat(TK.RP);
        return Node.Pred(n,args);
      }
      // Predicado 0-ário
      return Node.Pred(n,[]);
    }
    if (peek() && peek().t===TK.LP){
      eat(TK.LP);
      const f = parseFormula();
      eat(TK.RP);
      return f;
    }
    throw new Error('Átomo esperado');
  }

  function parseUnary(){
    if (peek() && peek().t===TK.NOT){ 
      eat(TK.NOT); 
      return Node.Not(parseUnary()); 
    }
    if (peek() && (peek().t===TK.FORALL || peek().t===TK.EXISTS)){
      const isForall = (peek().t===TK.FORALL); 
      i++;
      const v = eat(TK.NAME).v;
      if (peek() && peek().t===TK.DOT) eat(TK.DOT);
      const body = parseUnary();
      return isForall ? Node.Forall(v,body) : Node.Exists(v,body);
    }
    return parseAtom();
  }

  // CORRIGIDO: Precedência correta de operadores
  function parseFormula(){ 
    return parseIff(); 
  }

  function parseIff(){
    let left = parseImplies();
    while (peek() && peek().t===TK.IFF){
      eat(TK.IFF); 
      const r = parseImplies(); 
      left = Node.Iff(left,r);
    }
    return left;
  }

  function parseImplies(){
    let left = parseOr();
    while (peek() && peek().t===TK.IMPLIES){
      eat(TK.IMPLIES); 
      const r = parseOr(); 
      left = Node.Implies(left,r);
    }
    return left;
  }

  function parseOr(){
    let left = parseAnd();
    while (peek() && peek().t===TK.OR){ 
      eat(TK.OR); 
      const r = parseAnd(); 
      left = Node.Or(left,r); 
    }
    return left;
  }

  function parseAnd(){
    let left = parseUnary();
    while (peek() && peek().t===TK.AND){ 
      eat(TK.AND); 
      const r = parseUnary(); 
      left = Node.And(left,r); 
    }
    return left;
  }

  const ast = parseFormula();
  if (i !== tokens.length) throw new Error(`Tokens remanescentes: ${tokens.slice(i).map(t=>t.v).join(' ')}`);
  return ast;
}

/* =========================
   Transformações lógicas - CORRIGIDAS
   ========================= */
let skolemId = 0;
function freshSkolem(){ return `SK${++skolemId}`; }
let alphaId = 0;
function freshVar(base='x'){ return `${base}_${++alphaId}`; }

function freeVars(t){
  switch(t.k){
    case 'Var': return new Set([t.name]);
    case 'Const': return new Set();
    case 'Func': return t.args.reduce((s,a)=>{ 
      for(const v of freeVars(a)) s.add(v); 
      return s; 
    }, new Set());
    case 'Pred': return t.args.reduce((s,a)=>{ 
      for(const v of freeVars(a)) s.add(v); 
      return s; 
    }, new Set());
    case 'Eq': { 
      const s=freeVars(t.l); 
      for(const v of freeVars(t.r)) s.add(v); 
      return s; 
    }
    case 'Not': return freeVars(t.f);
    case 'And': case 'Or': case 'Implies': case 'Iff': {
      const s=freeVars(t.l); 
      for(const v of freeVars(t.r)) s.add(v); 
      return s;
    }
    case 'Forall': case 'Exists': { 
      const s=freeVars(t.f); 
      s.delete(t.v); 
      return s; 
    }
  }
  return new Set();
}

function substTerm(t, map){
  switch(t.k){
    case 'Var': return map[t.name] ?? t;
    case 'Const': return t;
    case 'Func': return Node.Func(t.name, t.args.map(a=>substTerm(a,map)));
    case 'Eq': return Node.Eq(substTerm(t.l,map), substTerm(t.r,map));
    case 'Pred': return Node.Pred(t.name, t.args.map(a=>substTerm(a,map)));
    case 'Not': return Node.Not(substTerm(t.f,map));
    case 'And': return Node.And(substTerm(t.l,map), substTerm(t.r,map));
    case 'Or': return Node.Or(substTerm(t.l,map), substTerm(t.r,map));
    case 'Implies': return Node.Implies(substTerm(t.l,map), substTerm(t.r,map));
    case 'Iff': return Node.Iff(substTerm(t.l,map), substTerm(t.r,map));
    case 'Forall': {
      const m = {...map}; 
      delete m[t.v];
      return Node.Forall(t.v, substTerm(t.f,m));
    }
    case 'Exists': {
      const m = {...map}; 
      delete m[t.v];
      return Node.Exists(t.v, substTerm(t.f,m));
    }
  }
}

function elimIffImp(f){
  switch(f.k){
    case 'Iff':
      // (A↔B) ≡ (A→B) ∧ (B→A)
      return Node.And(
        elimIffImp(Node.Implies(f.l,f.r)), 
        elimIffImp(Node.Implies(f.r,f.l))
      );
    case 'Implies':
      // (A→B) ≡ (¬A ∨ B)
      return Node.Or(Node.Not(elimIffImp(f.l)), elimIffImp(f.r));
    case 'Not': return Node.Not(elimIffImp(f.f));
    case 'And': return Node.And(elimIffImp(f.l), elimIffImp(f.r));
    case 'Or': return Node.Or(elimIffImp(f.l), elimIffImp(f.r));
    case 'Forall': return Node.Forall(f.v, elimIffImp(f.f));
    case 'Exists': return Node.Exists(f.v, elimIffImp(f.f));
    default: return f;
  }
}

function toNNF(f){
  switch(f.k){
    case 'Not':
      const g = f.f;
      switch(g.k){
        case 'Not': return toNNF(g.f); // ¬¬A ≡ A
        case 'And': return Node.Or(toNNF(Node.Not(g.l)), toNNF(Node.Not(g.r))); // ¬(A∧B) ≡ ¬A∨¬B
        case 'Or':  return Node.And(toNNF(Node.Not(g.l)), toNNF(Node.Not(g.r))); // ¬(A∨B) ≡ ¬A∧¬B
        case 'Forall': return Node.Exists(g.v, toNNF(Node.Not(g.f))); // ¬∀x P(x) ≡ ∃x ¬P(x)
        case 'Exists': return Node.Forall(g.v, toNNF(Node.Not(g.f))); // ¬∃x P(x) ≡ ∀x ¬P(x)
        default: return Node.Not(toNNF(g));
      }
    case 'And': return Node.And(toNNF(f.l), toNNF(f.r));
    case 'Or': return Node.Or(toNNF(f.l), toNNF(f.r));
    case 'Forall': return Node.Forall(f.v, toNNF(f.f));
    case 'Exists': return Node.Exists(f.v, toNNF(f.f));
    default: return f;
  }
}

// CORRIGIDO: Renomeação de variáveis mais robusta
function standardizeApart(f, used = new Set()){
  const boundVars = new Set();
  
  function collect(node) {
    switch(node.k) {
      case 'Forall': case 'Exists':
        boundVars.add(node.v);
        collect(node.f);
        break;
      case 'And': case 'Or': case 'Implies': case 'Iff':
        collect(node.l);
        collect(node.r);
        break;
      case 'Not':
        collect(node.f);
        break;
    }
  }
  
  collect(f);
  
  const renameMap = new Map();
  for (const v of boundVars) {
    if (used.has(v)) {
      let newName = v;
      let counter = 1;
      while (used.has(newName) || boundVars.has(newName)) {
        newName = `${v}_${counter++}`;
      }
      renameMap.set(v, newName);
      used.add(newName);
    } else {
      used.add(v);
    }
  }
  

  function rename(node) {
    switch(node.k) {
      case 'Var':
        return renameMap.has(node.name) ? Node.Var(renameMap.get(node.name)) : node;
      case 'Forall': case 'Exists':
        const newVar = renameMap.get(node.v) || node.v;
        return node.k === 'Forall' 
          ? Node.Forall(newVar, rename(node.f))
          : Node.Exists(newVar, rename(node.f));
      case 'And': case 'Or': case 'Implies': case 'Iff':
        return Node[node.k](rename(node.l), rename(node.r));
      case 'Not':
        return Node.Not(rename(node.f));
      case 'Pred':
        return Node.Pred(node.name, node.args.map(rename));
      case 'Eq':
        return Node.Eq(rename(node.l), rename(node.r));
      case 'Func':
        return Node.Func(node.name, node.args.map(rename));
      default:
        return node;
    }
  }
  
  return rename(f);
}

// move para prenex: retorna {qs: [{q:'forall'|'exists', v}], matrix: ...}
function prenexStrict(f){
  switch(f.k){
    case 'Forall': {
      const inner=prenexStrict(f.f);
      return {qs:[{q:'forall',v:f.v},...inner.qs], matrix:inner.matrix};
    }
    case 'Exists': {
      const inner=prenexStrict(f.f);
      return {qs:[{q:'exists',v:f.v},...inner.qs], matrix:inner.matrix};
    }
    case 'And': {
      const L=prenexStrict(f.l); const R=prenexStrict(f.r);
      return {qs:[...L.qs,...R.qs], matrix:Node.And(L.matrix,R.matrix)};
    }
    case 'Or': {
      const L=prenexStrict(f.l); const R=prenexStrict(f.r);
      return {qs:[...L.qs,...R.qs], matrix:Node.Or(L.matrix,R.matrix)};
    }
    case 'Not': {
      const I=prenexStrict(f.f);
      return {qs:I.qs, matrix:Node.Not(I.matrix)};
    }
    default: return {qs:[], matrix:f};
  }
}
function rebuildPrenex(qs,matrix){
  return qs.reduceRight((acc,q)=>q.q==='forall'?Node.Forall(q.v,acc):Node.Exists(q.v,acc),matrix);
}


// CORRIGIDO: Skolemização considerando escopo correto
function skolemizePrenex(prenex){
  const quantifiers = [];
  let f = prenex;
  
  // Extrair sequência de quantificadores
  while (f.k==='Forall' || f.k==='Exists'){
    quantifiers.push({type: f.k, var: f.v});
    f = f.f;
  }
  
  function skolemizeMatrix(matrix, qIndex = 0) {
    if (qIndex >= quantifiers.length) return matrix;
    
    const currentQ = quantifiers[qIndex];
    if (currentQ.type === 'Forall') {
      return skolemizeMatrix(matrix, qIndex + 1);
    }
    
    // É um EXISTS - skolemizar
    const universalsBeforeThis = quantifiers
      .slice(0, qIndex)
      .filter(q => q.type === 'Forall')
      .map(q => q.var);
    
    const skolemName = freshSkolem();
    const skolemTerm = universalsBeforeThis.length === 0 
      ? Node.Const(skolemName)
      : Node.Func(skolemName, universalsBeforeThis.map(v => Node.Var(v)));
    
    // Substituir a variável existencial
    const substituted = substTerm(matrix, {[currentQ.var]: skolemTerm});
    
    return skolemizeMatrix(substituted, qIndex + 1);
  }
  
  const skolemizedMatrix = skolemizeMatrix(f);
  
  // Reconstruir apenas com universais
  const universalQs = quantifiers
    .filter(q => q.type === 'Forall')
    .map(q => ({q: 'forall', v: q.var}));
  
  return rebuildPrenex(universalQs, skolemizedMatrix);
}

function distributeOrOverAnd(f){
  // CNF: distribui OR sobre AND
  	budgetGuard('CNF');
	if (f.k==='Or'){
    const A = distributeOrOverAnd(f.l);
    const B = distributeOrOverAnd(f.r);
    if (A.k==='And') {
      return Node.And(
        distributeOrOverAnd(Node.Or(A.l,B)), 
        distributeOrOverAnd(Node.Or(A.r,B))
      );
    }
    if (B.k==='And') {
      return Node.And(
        distributeOrOverAnd(Node.Or(A,B.l)), 
        distributeOrOverAnd(Node.Or(A,B.r))
      );
    }
    return Node.Or(A,B);
  }
  if (f.k==='And') return Node.And(distributeOrOverAnd(f.l), distributeOrOverAnd(f.r));
  return f;
}

function distributeAndOverOr(f){
  // DNF: distribui AND sobre OR
  	budgetGuard('DNF');
	if (f.k==='And'){
    const A = distributeAndOverOr(f.l);
    const B = distributeAndOverOr(f.r);
    if (A.k==='Or') {
      return Node.Or(

        distributeAndOverOr(Node.And(A.l,B)), 
        distributeAndOverOr(Node.And(A.r,B))
      );
    }
    if (B.k==='Or') {
      return Node.Or(
        distributeAndOverOr(Node.And(A,B.l)), 
        distributeAndOverOr(Node.And(A,B.r))
      );
    }
    return Node.And(A,B);
  }
  if (f.k==='Or') return Node.Or(distributeAndOverOr(f.l), distributeAndOverOr(f.r));
  return f;
}

/* =========================
   Impressão LaTeX - CORRIGIDA
   ========================= */
function termToLatex(t){
  switch(t.k){
    case 'Var': return t.name;
    case 'Const': return t.name;
    case 'Func': return `${t.name}(${t.args.map(termToLatex).join(',')})`;
    default: return '?';
  }
}

function atomToLatex(t){
  switch(t.k){
    case 'Pred': return `${t.name}${t.args.length? '('+t.args.map(termToLatex).join(',')+')':''}`;
    case 'Eq': return `${termToLatex(t.l)} = ${termToLatex(t.r)}`;
    default: return termToLatex(t);
  }
}

function toLatex(f){
  switch(f.k){
    case 'Not': return `\\neg ${toAtomWrap(f.f)}`;
    case 'And': return `${toAtomWrap(f.l)} \\land ${toAtomWrap(f.r)}`;
    case 'Or':  return `${toAtomWrap(f.l)} \\lor ${toAtomWrap(f.r)}`;
    case 'Forall': return `\\forall ${f.v}\\, ${toLatex(f.f)}`;
    case 'Exists': return `\\exists ${f.v}\\, ${toLatex(f.f)}`;
    case 'Pred': case 'Eq': return atomToLatex(f);
    default: return atomToLatex(f);
  }
}

function toAtomWrap(f){
  const s = toLatex(f);
  if (f.k==='Pred' || f.k==='Eq' || f.k==='Var' || f.k==='Const') return s;
  return `(${s})`;
}

/* =========================
   Cláusulas e Horn - CORRIGIDAS
   ========================= */
function splitAnd(f){
  if (f.k==='And') return [...splitAnd(f.l), ...splitAnd(f.r)];
  return [f];
}

function splitOr(f){
  if (f.k==='Or') return [...splitOr(f.l), ...splitOr(f.r)];
  return [f];
}

function isPositiveLiteral(l){
  return l.k==='Pred' || l.k==='Eq';
}

function isNegativeLiteral(l){
  return l.k==='Not' && (l.f.k==='Pred' || l.f.k==='Eq');
}

// CORRIGIDO: Detecção correta de cláusulas de Horn
function isHornClause(literals) {
  const positiveLiterals = literals.filter(isPositiveLiteral);
  return positiveLiterals.length <= 1;
}

function clauseToLatex(lits){
  if (lits.length === 0) return '\\bot'; // cláusula vazia
  return lits.map(L => {
    if (L.k==='Not') return `\\neg ${toAtomWrap(L.f)}`;
    return toAtomWrap(L);
  }).join(' \\lor ');
}

/* =========================
   Orquestração de passos - CORRIGIDA
   ========================= */
class Engine {
  constructor(inputLatex){
    this.input = inputLatex;
    this.stepsCNF = [];
    this.stepsDNF = [];
    this.stepsClausal = [];
    this.stepsHorn = [];
  }

  // parse em AST
  parse(){
    try {
      const tokens = tokenize(this.input);
      return Parser(tokens);
    } catch (error) {
      throw new Error(`Erro de sintaxe: ${error.message}`);
    }
  }

  // pipeline comum inicial
  commonPipeline(ast, steps){
    steps.push('1. Eliminar equivalências (↔) e implicações (→)');
    let f1 = elimIffImp(ast);

    steps.push('2. Converter para NNF (negações para dentro)');
    let f2 = toNNF(f1);

    steps.push('3. Padronizar variáveis ligadas (α-renomeação)');
    let f3 = standardizeApart(f2);

    steps.push('4. Mover quantificadores para forma Prenex');
    const pulled = prenexStrict(f3);
    let f4 = rebuildPrenex(pulled.qs, pulled.matrix);

    return f4;
  }

  // CNF Prenex
  cnfPrenex(ast){
    const s = this.stepsCNF;
    let prenex = this.commonPipeline(ast, s);

    s.push('5. Skolemizar (remover existenciais usando funções de Skolem)');
    skolemId = 0; // reset
    const skol = skolemizePrenex(prenex);

    s.push('6. Distribuir OR sobre AND para obter CNF');
    const pulled = prenexStrict(skol);
    const matrixNNF = toNNF(pulled.matrix);
    const cnfMatrix = distributeOrOverAnd(matrixNNF);

    return rebuildPrenex(pulled.qs, cnfMatrix);
  }

  // DNF Prenex (sem skolem)

  dnfPrenex(ast){
    const s = this.stepsDNF;
    let prenex = this.commonPipeline(ast, s);

    const pulled = prenexStrict(prenex);
    s.push('5. Distribuir AND sobre OR para obter DNF');
    const matrixNNF = toNNF(pulled.matrix);
    const dnfMatrix = distributeAndOverOr(matrixNNF);

    return rebuildPrenex(pulled.qs, dnfMatrix);
  }

  // Forma Cláusal a partir da CNF skolemizada
  clausal(cnfPrenexAst){
    const s = this.stepsClausal;
    
    s.push('1. Remover quantificadores universais (implícitos na forma cláusal)');
    let f = cnfPrenexAst;
    while (f.k==='Forall') f = f.f;
    
    s.push('2. Extrair conjunções como cláusulas separadas');
    const clauses = splitAnd(f).map(c => splitOr(c));
    
    s.push(`3. Resultado: ${clauses.length} cláusula(s) extraída(s)`);
    
    return clauses;
  }

  // CORRIGIDO: Análise de Horn mais precisa
  hornInfo(clauses){
    const s = this.stepsHorn;
    let horn = [], notHorn = [];
    
    s.push('1. Analisando cada cláusula para determinar se é Horn');
    
    clauses.forEach((cl, index) => {
      const positiveLiterals = cl.filter(isPositiveLiteral);
      const negativeLiterals = cl.filter(isNegativeLiteral);
      
      s.push(`Cláusula ${index + 1}: ${positiveLiterals.length} literal(is) positivo(s), ${negativeLiterals.length} negativo(s)`);
      
      if (positiveLiterals.length <= 1) {
        horn.push(cl);
        s.push(`→ É cláusula de Horn (≤ 1 literal positivo)`);
      } else {
        notHorn.push(cl);
        s.push(`→ NÃO é cláusula de Horn (> 1 literal positivo)`);
      }
    });
    
    if (horn.length === clauses.length) {
      s.push('2. ✓ Todas as cláusulas são de Horn!');
    } else {
      s.push(`2. ${horn.length}/${clauses.length} cláusulas são de Horn`);
    }
    
    return {horn, notHorn};
  }
}

/* =========================
   UI glue - MELHORADA
   ========================= */
function setExample(formula) {
  document.getElementById('formula-input').value = formula;
}

function displayError(message) {
  const errorDiv = document.getElementById('error-display');
  errorDiv.innerHTML = `<div class="error">${message}</div>`;
  errorDiv.style.display = 'block';
}

function clearError() {
  const errorDiv = document.getElementById('error-display');
  errorDiv.innerHTML = '';
  errorDiv.style.display = 'none';
}

function displaySteps(elementId, steps) {
  const el = document.getElementById(elementId);
  if (!steps || steps.length===0){ 
    el.innerHTML=''; 
    return; 
  }
  el.innerHTML = `
    <h4>Passos da transformação:</h4>
    <ol>${steps.map(s=>`<li>${s}</li>`).join('')}</ol>
  `;
}

// MELHORADA: Função principal com melhor tratamento de erros
async function transformFormula() {
  	nodeBudget = nodeBudgetMax;
	const input = document.getElementById('formula-input').value.trim();
  if (!input) { 
    displayError('Por favor, digite uma fórmula.'); 
    return; 
  }
  
  clearError();
  
  // Mostrar indicador de carregamento
  const btn = document.querySelector('.transform-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Processando...';
  btn.disabled = true;

  try {
    const engine = new Engine(input);
    const ast = engine.parse();

    // Original
    await displayFormula('original-formula', input);

    // CNF Prenex
    const cnfAst = engine.cnfPrenex(ast);
    await displayFormula('cnf-prenex-formula', toLatex(cnfAst));
    displaySteps('cnf-prenex-steps', engine.stepsCNF);

    // DNF Prenex
    const dnfAst = engine.dnfPrenex(ast);
    await displayFormula('dnf-prenex-formula', toLatex(dnfAst));
    displaySteps('dnf-prenex-steps', engine.stepsDNF);

    // Forma Cláusal
    const clauses = engine.clausal(cnfAst);
    const clausalLatex = clauses.length > 0 
      ? clauses.map(cl => clauseToLatex(cl)).join(' \\\\ ')
      : '\\text{Nenhuma cláusula}';
    await displayFormula('clausal-formula', clausalLatex);
    displaySteps('clausal-steps', engine.stepsClausal);

    // Cláusulas de Horn
    const hi = engine.hornInfo(clauses);
    let hornDisplay = '';
    
    if (hi.horn.length > 0){
      hornDisplay += '\\text{Cláusulas de Horn:} \\\\ ' + 
        hi.horn.map(cl=>clauseToLatex(cl)).join(' \\\\ ');
    }
    
    if (hi.notHorn.length > 0){
      if (hornDisplay) hornDisplay += ' \\\\ \\\\ ';
      hornDisplay += '\\text{Não-Horn:} \\\\ ' + 
        hi.notHorn.map(cl=>clauseToLatex(cl)).join(' \\\\ ');
    }
    
    if (!hornDisplay) {
      hornDisplay = '\\text{Nenhuma cláusula encontrada}';
    }
    
    await displayFormula('horn-formula', hornDisplay);
    displaySteps('horn-steps', engine.stepsHorn);

    // Mostrar resultados
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({behavior:'smooth'});

  } catch (err) {
    console.error('Erro detalhado:', err);
    
    let errorMsg = 'Erro ao processar a fórmula';
    if (err.message.includes('Token inválido')) {
      errorMsg = 'Sintaxe inválida. Verifique os símbolos LaTeX utilizados.';
    } else if (err.message.includes('Esperado')) {
      errorMsg = 'Erro de sintaxe: ' + err.message;
    } else if (err.message.includes('muito complexa') || err.message.includes('limite')) {
      errorMsg = '' + err.message;
    } else {
      errorMsg = err.message;
    }
    
    displayError(errorMsg);
  } finally {
    // Restaurar botão
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Event listeners
document.getElementById('formula-input').addEventListener('keypress', function(e){
  if (e.key==='Enter' && e.ctrlKey) {
    e.preventDefault();
    transformFormula();
  }
});

// Validação em tempo real (opcional)
document.getElementById('formula-input').addEventListener('input', function(e) {
  clearError(); // Limpar erros ao digitar
});

document.addEventListener('DOMContentLoaded', ()=>{
  console.log('Transformador de Fórmulas Lógicas carregado (versão corrigida)');
  
  // Reset contadores globais
  skolemId = 0;
  alphaId = 0;
});