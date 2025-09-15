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
      errBox.innerHTML = `<div class="error">Math input error. Verifique a sintaxe LaTeX.</div>`;
      errBox.style.display = 'block';
    }
    el.innerHTML = `<code>${latex.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`;
  }
}

/* =========================
   Lexer + Parser (AST)
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

  // Se usuário colar com $$...$$, removemos os cifrões
  s = s.replace(/\$/g, '');

  // Conectivos e quantificadores comuns em LaTeX -> símbolos internos
  s = s
    .replace(/\\forall/g, '∀')
    .replace(/\\exists/g, '∃')
    .replace(/\\neg|\\lnot/g, '¬')
    .replace(/\\land|\\wedge/g, '∧')
    .replace(/\\lor|\\vee/g, '∨')
    .replace(/\\to|\\rightarrow|\\implies/g, '→')
    .replace(/\\leftrightarrow|\\iff/g, '↔');

  // Remover comandos de espaçamento (\, \; \: \! e '\ '), ~ e equivalentes
  s = s
    .replace(/\\[,;:! ]/g, ' ')  // \, \; \: \! e '\ '
    .replace(/~/g, ' ');

  // Remover comandos de tamanho de delimitadores e \left \right
  s = s
    .replace(/\\left|\\right/g, '')
    .replace(/\\bigl|\\bigr|\\Bigl|\\Bigr|\\biggl|\\biggr|\\Biggl|\\Biggr/g, '');

  // Remover chaves de agrupamento do LaTeX
  s = s.replace(/[{}]/g, '');

  // Espaços a mais
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
  const eat=(t)=>{ const x=peek(); if(!x||x.t!==t) throw new Error(`Esperado ${t}`); i++; return x; };

  function parseTerm(){
    const n = eat(TK.NAME).v;
    if (peek() && peek().t===TK.LP){
      eat(TK.LP);
      const args=[];
      if (peek().t!==TK.RP){
        args.push(parseTermLike());

        while (peek() && peek().t===TK.COMMA){ eat(TK.COMMA); args.push(parseTermLike()); }
      }
      eat(TK.RP);
      return Node.Func(n,args);
    }
    // Heurística: nomes minúsculos = variáveis; maiúsculos = constantes (ajuda formatação)
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
          while (peek() && peek().t===TK.COMMA){ eat(TK.COMMA); args.push(parseTermLike()); }
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
    if (peek() && peek().t===TK.NOT){ eat(TK.NOT); return Node.Not(parseUnary()); }
    if (peek() && (peek().t===TK.FORALL || peek().t===TK.EXISTS)){
      const isForall = (peek().t===TK.FORALL); i++;
      const v = eat(TK.NAME).v;
      if (peek() && peek().t===TK.DOT) eat(TK.DOT);
      const body = parseUnary();
      return isForall ? Node.Forall(v,body) : Node.Exists(v,body);
    }
    return parseAtom();
  }

  function parseImp(){
    // nível mais baixo: OR/AND já resolvidos
    let left = parseOr();
    while (peek() && (peek().t===TK.IMPLIES || peek().t===TK.IFF)){
      if (peek().t===TK.IMPLIES){ eat(TK.IMPLIES); const r=parseOr(); left = Node.Implies(left,r); }
      else { eat(TK.IFF); const r=parseOr(); left = Node.Iff(left,r); }
    }
    return left;
  }

  function parseOr(){
    let left = parseAnd();
    while (peek() && peek().t===TK.OR){ eat(TK.OR); const r=parseAnd(); left = Node.Or(left,r); }
    return left;
  }

  function parseAnd(){
    let left = parseUnary();
    while (peek() && peek().t===TK.AND){ eat(TK.AND); const r=parseUnary(); left = Node.And(left,r); }
    return left;
  }

  function parseFormula(){ return parseImp(); }

  const ast = parseFormula();
  if (i !== tokens.length) throw new Error('Tokens remanescentes não parseados');
  return ast;
}

/* =========================
   Transformações lógicas
   ========================= */
let skolemId = 0;
function freshSkolem(){ return `SK${++skolemId}`; }
let alphaId = 0;
function freshVar(base='x'){ return `${base}_${++alphaId}`; }

function freeVars(t){
  switch(t.k){
    case 'Var': return new Set([t.name]);
    case 'Const': return new Set();
    case 'Func': return t.args.reduce((s,a)=>{ for(const v of freeVars(a)) s.add(v); return s; }, new Set());
    case 'Pred': return t.args.reduce((s,a)=>{ for(const v of freeVars(a)) s.add(v); return s; }, new Set());
    case 'Eq': { const s=freeVars(t.l); for(const v of freeVars(t.r)) s.add(v); return s; }
    case 'Not': return freeVars(t.f);
    case 'And': case 'Or': case 'Implies': case 'Iff': {
      const s=freeVars(t.l); for(const v of freeVars(t.r)) s.add(v); return s;
    }
    case 'Forall': { const s=freeVars(t.f); s.delete(t.v); return s; }
    case 'Exists': { const s=freeVars(t.f); s.delete(t.v); return s; }
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
      const m = {...map}; delete m[t.v];
      return Node.Forall(t.v, substTerm(t.f,m));
    }
    case 'Exists': {
      const m = {...map}; delete m[t.v];
      return Node.Exists(t.v, substTerm(t.f,m));
    }
  }
}

function elimIffImp(f){
  switch(f.k){
    case 'Iff':
      // (A↔B) ≡ (A→B) ∧ (B→A)
      return Node.And(elimIffImp(Node.Implies(f.l,f.r)), elimIffImp(Node.Implies(f.r,f.l)));
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
        case 'Not': return toNNF(g.f);
        case 'And': return Node.Or(toNNF(Node.Not(g.l)), toNNF(Node.Not(g.r)));
        case 'Or':  return Node.And(toNNF(Node.Not(g.l)), toNNF(Node.Not(g.r)));
        case 'Forall': return Node.Exists(g.v, toNNF(Node.Not(g.f)));
        case 'Exists': return Node.Forall(g.v, toNNF(Node.Not(g.f)));
        default: return Node.Not(toNNF(g));
      }
    case 'And': return Node.And(toNNF(f.l), toNNF(f.r));
    case 'Or': return Node.Or(toNNF(f.l), toNNF(f.r));
    case 'Forall': return Node.Forall(f.v, toNNF(f.f));
    case 'Exists': return Node.Exists(f.v, toNNF(f.f));
    default: return f;
  }
}

// padroniza variáveis ligadas para evitar captura
function standardizeApart(f, bound=new Map()){
  function freshAvoid(v){
    if (!bound.has(v)) { const nv = freshVar(v); bound.set(v,nv); return nv; }
    return bound.get(v);
  }
  switch(f.k){
    case 'Forall': {
      const nv=freshAvoid(f.v);
      const body = standardizeApart(substTerm(f.f, {[f.v]: Node.Var(nv)}), bound);
      return Node.Forall(nv, body);
    }
    case 'Exists': {
      const nv=freshAvoid(f.v);
      const body = standardizeApart(substTerm(f.f, {[f.v]: Node.Var(nv)}), bound);
      return Node.Exists(nv, body);
    }
    case 'Not': return Node.Not(standardizeApart(f.f, bound));
    case 'And': return Node.And(standardizeApart(f.l,bound), standardizeApart(f.r,bound));
    case 'Or':  return Node.Or(standardizeApart(f.l,bound), standardizeApart(f.r,bound));
    default: return f;
  }
}

// move para prenex: retorna {qs: [{q:'forall'|'exists', v}], matrix: ...}
function pullQuantifiers(f){
  switch(f.k){
    case 'Forall': {
      const inner = pullQuantifiers(f.f);
      return { qs: [{q:'forall', v:f.v}, ...inner.qs], matrix: inner.matrix };
    }
    case 'Exists': {
      const inner = pullQuantifiers(f.f);
      return { qs: [{q:'exists', v:f.v}, ...inner.qs], matrix: inner.matrix };
    }
    case 'And':
    case 'Or': {
      const L = pullQuantifiers(f.l);
      const R = pullQuantifiers(f.r);
      // concatenar prefixos — como standardizeApart já evitou captura, é seguro
      return { qs: [...L.qs, ...R.qs], matrix: {k:f.k, l:L.matrix, r:R.matrix} };
    }
    case 'Not': {
      const I = pullQuantifiers(f.f);
      return { qs: I.qs, matrix: {k:'Not', f:I.matrix} };
    }
    default: return { qs: [], matrix: f };
  }
}

function rebuildPrenex(qs, matrix){
  return qs.reduceRight((acc, q)=> q.q==='forall' ? Node.Forall(q.v, acc) : Node.Exists(q.v, acc), matrix);
}

// Skolemização para gerar base da CNF/Cláusulas
function skolemizePrenex(prenex){
  const prefix = [];
  let f = prenex;
  while (f.k==='Forall' || f.k==='Exists') { prefix.push(f); f = f.f; }

  let matrix = f;
  let universalsSeen = []; // apenas os ∀ vistos antes do ∃ atual
  skolemId = 0;

  function replaceVar(t, vname, withTerm){
    switch(t.k){
      case 'Var': return t.name===vname ? withTerm : t;
      case 'Const': return t;
      case 'Func': return Node.Func(t.name, t.args.map(a=>replaceVar(a,vname,withTerm)));
      case 'Eq': return Node.Eq(replaceVar(t.l,vname,withTerm), replaceVar(t.r,vname,withTerm));
      case 'Pred': return Node.Pred(t.name, t.args.map(a=>replaceVar(a,vname,withTerm)));
      case 'Not': return Node.Not(replaceVar(t.f,vname,withTerm));
      case 'And': return Node.And(replaceVar(t.l,vname,withTerm), replaceVar(t.r,vname,withTerm));
      case 'Or':  return Node.Or(replaceVar(t.l,vname,withTerm),  replaceVar(t.r,vname,withTerm));
      case 'Forall': return Node.Forall(t.v, replaceVar(t.f,vname,withTerm));
      case 'Exists': return Node.Exists(t.v, replaceVar(t.f,vname,withTerm));
      default: return t;
    }
  }

  for (const q of prefix){
    if (q.k==='Forall'){
      universalsSeen.push(q.v);
    } else { // Exists
      const skName = freshSkolem();
      const skTerm = universalsSeen.length
        ? Node.Func(skName, universalsSeen.map(v=>Node.Var(v)))
        : Node.Const(skName);
      matrix = replaceVar(matrix, q.v, skTerm);
    }
  }

  // Remonta apenas os universais (existenciais já foram removidos)
  const qs = universalsSeen.map(v => ({q:'forall', v}));
  return rebuildPrenex(qs, matrix);
}


function distributeOrOverAnd(f){
  // CNF: distribui OR sobre AND
  if (f.k==='Or'){
    const A = distributeOrOverAnd(f.l);
    const B = distributeOrOverAnd(f.r);
    if (A.k==='And') return Node.And(distributeOrOverAnd(Node.Or(A.l,B)), distributeOrOverAnd(Node.Or(A.r,B)));
    if (B.k==='And') return Node.And(distributeOrOverAnd(Node.Or(A,B.l)), distributeOrOverAnd(Node.Or(A,B.r)));
    return Node.Or(A,B);
  }
  if (f.k==='And') return Node.And(distributeOrOverAnd(f.l), distributeOrOverAnd(f.r));
  if (f.k==='Not' || f.k==='Pred' || f.k==='Eq' || f.k==='Func' || f.k==='Var' || f.k==='Const') return f;
  return f; // matriz já em NNF
}

function distributeAndOverOr(f){
  // DNF: distribui AND sobre OR
  if (f.k==='And'){
    const A = distributeAndOverOr(f.l);
    const B = distributeAndOverOr(f.r);
    if (A.k==='Or') return Node.Or(distributeAndOverOr(Node.And(A.l,B)), distributeAndOverOr(Node.And(A.r,B)));
    if (B.k==='Or') return Node.Or(distributeAndOverOr(Node.And(A,B.l)), distributeAndOverOr(Node.And(A,B.r)));
    return Node.And(A,B);
  }
  if (f.k==='Or') return Node.Or(distributeAndOverOr(f.l), distributeAndOverOr(f.r));
  if (f.k==='Not' || f.k==='Pred' || f.k==='Eq' || f.k==='Func' || f.k==='Var' || f.k==='Const') return f;
  return f;
}

/* =========================
   Impressão LaTeX
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
   Cláusulas e Horn
   ========================= */
function splitAnd(f){ // CNF: top-level conjunções
  if (f.k==='And') return [...splitAnd(f.l), ...splitAnd(f.r)];
  return [f];
}
function splitOr(f){ // CNF: disjunção em uma cláusula
  if (f.k==='Or') return [...splitOr(f.l), ...splitOr(f.r)];
  return [f];
}
function isPositiveLiteral(l){
  return l.k==='Pred' || l.k==='Eq';
}
function isNegativeLiteral(l){
  return l.k==='Not' && (l.f.k==='Pred' || l.f.k==='Eq');
}
function clauseToLatex(lits){
  return lits.map(L => {
    if (L.k==='Not') return `\\neg ${toAtomWrap(L.f)}`;
    return toAtomWrap(L);
  }).join(' \\lor ');
}

/* =========================
   Orquestração de passos
   ========================= */
class Engine {
  constructor(inputLatex){
    this.input = inputLatex;
    this.stepsCNF = [];
    this.stepsDNF = [];
  }

  // parse em AST
  parse(){
    const tokens = tokenize(this.input);
    return Parser(tokens);
  }

  // pipeline comum inicial
  commonPipeline(ast, steps){
    steps.push('Eliminar equivalências (↔) e implicações (→)');
    let f1 = elimIffImp(ast);

    steps.push('Converter para NNF (negações para dentro)');
    let f2 = toNNF(f1);

    steps.push('Padronizar variáveis ligadas (α-renomeação)');
    let f3 = standardizeApart(f2);

    steps.push('Mover quantificadores para forma Prenex');
    const pulled = pullQuantifiers(f3);
    let f4 = rebuildPrenex(pulled.qs, pulled.matrix);

    return f4;
  }

  // CNF Prenex
  cnfPrenex(ast){
    const s = this.stepsCNF;
    let prenex = this.commonPipeline(ast, s);

    s.push('Skolemizar (remover existenciais em função dos universais anteriores)');
    skolemId = 0; // reset
    const skol = skolemizePrenex(prenex);

    // após skolem, eliminar universais (convencional para cláusulas)
    // mas manteremos o prefixo universal para "CNF Prenex"
    const pulled = pullQuantifiers(skol);
    s.push('Distribuir OR sobre AND (CNF)');
    const matrixNNF = toNNF(pulled.matrix);
    const cnfMatrix = distributeOrOverAnd(matrixNNF);

    return rebuildPrenex(pulled.qs, cnfMatrix);
  }

  // DNF Prenex (sem skolem)
  dnfPrenex(ast){
    const s = this.stepsDNF;
    let prenex = this.commonPipeline(ast, s);

    const pulled = pullQuantifiers(prenex);
    s.push('Distribuir AND sobre OR (DNF)');
    const matrixNNF = toNNF(pulled.matrix);
    const dnfMatrix = distributeAndOverOr(matrixNNF);

    return rebuildPrenex(pulled.qs, dnfMatrix);
  }

  // Forma Cláusal a partir da CNF skolemizada
  clausal(cnfPrenexAst){
    // remove prefixo universal (implícito)
    let f = cnfPrenexAst;
    while (f.k==='Forall') f = f.f;
    const clauses = splitAnd(f).map(c => splitOr(c));
    return clauses;
  }

  // Horn
  hornInfo(clauses){
    let horn = [], notHorn = [];
    clauses.forEach(cl => {
      const positives = cl.filter(isPositiveLiteral).length +
                        cl.filter(l => l.k!=='Not' && (l.k==='Pred' || l.k==='Eq')).length;
      // (acima já conta positivos corretamente; negativos = Not(P(...)))
      const pos = cl.filter(l => isPositiveLiteral(l)).length;
      if (pos <= 1) horn.push(cl); else notHorn.push(cl);
    });
    return {horn, notHorn};
  }
}

/* =========================
   UI glue
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
  if (!steps || steps.length===0){ el.innerHTML=''; return; }
  el.innerHTML = `
    <h4>Passos da transformação:</h4>
    <ol>${steps.map(s=>`<li>${s}</li>`).join('')}</ol>
  `;
}

function transformFormula() {
  const input = document.getElementById('formula-input').value.trim();
  if (!input) { displayError('Por favor, digite uma fórmula.'); return; }
  clearError();

  try {
    const engine = new Engine(input);
    const ast = engine.parse();

    // Original
    displayFormula('original-formula', input);

    // CNF Prenex
    const cnfAst = engine.cnfPrenex(ast);
    displayFormula('cnf-prenex-formula', toLatex(cnfAst));
    displaySteps('cnf-prenex-steps', engine.stepsCNF);

    // DNF Prenex
    const dnfAst = engine.dnfPrenex(ast);
    displayFormula('dnf-prenex-formula', toLatex(dnfAst));
    displaySteps('dnf-prenex-steps', engine.stepsDNF);

    // Forma Cláusal
    const clauses = engine.clausal(cnfAst);
    const clausalLatex = clauses.map(cl => clauseToLatex(cl)).join(' \\\\ ');
    displayFormula('clausal-formula', clausalLatex);
    displaySteps('clausal-steps', ['Remover universais implícitos', 'Extrair conjunções como cláusulas (disjunções de literais)']);

    // Cláusulas de Horn
    const hi = engine.hornInfo(clauses);
    let hornDisplay = '';
    if (hi.horn.length){
      hornDisplay += '\\text{Cláusulas de Horn:} \\\\ ' + hi.horn.map(cl=>clauseToLatex(cl)).join(' \\\\ ');
    }
    if (hi.notHorn.length){
      if (hornDisplay) hornDisplay += ' \\\\ \\\\ ';
      hornDisplay += '\\text{Não-Horn:} \\\\ ' + hi.notHorn.map(cl=>clauseToLatex(cl)).join(' \\\\ ');
    }
    if (!hornDisplay) hornDisplay = '\\text{Nenhuma cláusula encontrada}';
    displayFormula('horn-formula', hornDisplay);

    // Mostrar painel
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({behavior:'smooth'});

  } catch (err) {
    console.error(err);
    displayError(`Erro ao processar a fórmula: ${err.message}`);
  }
}

// Atalhos
document.getElementById('formula-input').addEventListener('keypress', function(e){
  if (e.key==='Enter' && e.ctrlKey) transformFormula();
});
document.addEventListener('DOMContentLoaded', ()=>console.log('Transformador carregado'));