/**
 * SymboliQ — Symbolic Regression Engine v2
 * GP-based SR with Pareto front + algebraic simplifier
 * Browser-compatible, no dependencies.
 */
'use strict';

// ============================================================
// PHASE 1 — AST Node Hierarchy
// ============================================================

class Node {
  evaluate(inputs) { throw new Error('Abstract'); }
  clone() { throw new Error('Abstract'); }
  complexity() { return 1; }
  toString() { throw new Error('Abstract'); }
  toLatex() { return this.toString(); }
  toSympy() { return this.toString(); }
  allNodes() { return [this]; }
  depth() { return 0; }
}

class ConstantNode extends Node {
  constructor(value) { super(); this.value = value; }
  evaluate(_inputs) { return this.value; }
  clone() { return new ConstantNode(this.value); }
  complexity() { return 1; }
  toString() {
    const v = this.value;
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return parseFloat(v.toPrecision(4)).toString();
  }
  toLatex() { return this.toString(); }
  toSympy() { return this.toString(); }
  allNodes() { return [this]; }
  depth() { return 0; }
}

class VariableNode extends Node {
  constructor(index, name) { super(); this.index = index; this.name = name || ('x' + index); }
  evaluate(inputs) { return inputs[this.index]; }
  clone() { return new VariableNode(this.index, this.name); }
  complexity() { return 1; }
  toString() { return this.name; }
  toLatex() { return this.name; }
  toSympy() { return this.name; }
  allNodes() { return [this]; }
  depth() { return 0; }
}

class UnaryOpNode extends Node {
  constructor(op, child) { super(); this.op = op; this.child = child; }
  evaluate(inputs) { return UnaryOpNode.ops[this.op](this.child.evaluate(inputs)); }
  clone() { return new UnaryOpNode(this.op, this.child.clone()); }
  complexity() { return 1 + this.child.complexity(); }
  depth() { return 1 + this.child.depth(); }
  allNodes() { return [this].concat(this.child.allNodes()); }
  toString() {
    var c = this.child.toString();
    switch (this.op) {
      case 'square': return '(' + c + ')^2';
      case 'sqrt':   return 'sqrt(' + c + ')';
      case 'log':    return 'log(' + c + ')';
      case 'exp':    return 'exp(' + c + ')';
      case 'abs':    return 'abs(' + c + ')';
      case 'sin':    return 'sin(' + c + ')';
      case 'cos':    return 'cos(' + c + ')';
      case 'neg':    return '-(' + c + ')';
      default:       return this.op + '(' + c + ')';
    }
  }
  toLatex() {
    var c = this.child.toLatex();
    switch (this.op) {
      case 'square': return '{' + c + '}^{2}';
      case 'sqrt':   return '\\sqrt{' + c + '}';
      case 'log':    return '\\ln\\left(' + c + '\\right)';
      case 'exp':    return 'e^{' + c + '}';
      case 'abs':    return '\\left|' + c + '\\right|';
      case 'sin':    return '\\sin\\left(' + c + '\\right)';
      case 'cos':    return '\\cos\\left(' + c + '\\right)';
      case 'neg':    return '-\\left(' + c + '\\right)';
      default:       return '\\text{' + this.op + '}\\left(' + c + '\\right)';
    }
  }
  toSympy() {
    var c = this.child.toSympy();
    switch (this.op) {
      case 'square': return '(' + c + ')**2';
      case 'sqrt':   return 'sqrt(' + c + ')';
      case 'log':    return 'log(' + c + ')';
      case 'exp':    return 'exp(' + c + ')';
      case 'abs':    return 'Abs(' + c + ')';
      case 'sin':    return 'sin(' + c + ')';
      case 'cos':    return 'cos(' + c + ')';
      case 'neg':    return '-(' + c + ')';
      default:       return this.op + '(' + c + ')';
    }
  }
}
UnaryOpNode.ops = {
  square: function(v) { return v * v; },
  sqrt:   function(v) { return v < 0 ? Math.sqrt(-v) : Math.sqrt(v); },
  log:    function(v) { return v <= 0 ? 0 : Math.log(v); },
  exp:    function(v) { return v > 500 ? 1e10 : Math.exp(v); },
  abs:    function(v) { return Math.abs(v); },
  sin:    function(v) { return Math.sin(v); },
  cos:    function(v) { return Math.cos(v); },
  neg:    function(v) { return -v; },
};

class BinaryOpNode extends Node {
  constructor(op, left, right) { super(); this.op = op; this.left = left; this.right = right; }
  evaluate(inputs) { return BinaryOpNode.ops[this.op](this.left.evaluate(inputs), this.right.evaluate(inputs)); }
  clone() { return new BinaryOpNode(this.op, this.left.clone(), this.right.clone()); }
  complexity() { return 1 + this.left.complexity() + this.right.complexity(); }
  depth() { return 1 + Math.max(this.left.depth(), this.right.depth()); }
  allNodes() { return [this].concat(this.left.allNodes()).concat(this.right.allNodes()); }
  toString() {
    var l = this.left.toString(), r = this.right.toString();
    var lp = (this.left instanceof BinaryOpNode && (this.op==='*'||this.op==='/') && (this.left.op==='+'||this.left.op==='-'));
    var rp = (this.right instanceof BinaryOpNode && ((this.op==='*'||this.op==='/') && (this.right.op==='+'||this.right.op==='-') || (this.op==='/' || (this.op==='-' && (this.right.op==='+'||this.right.op==='-')))));
    return (lp?'('+l+')':l) + ' ' + this.op + ' ' + (rp?'('+r+')':r);
  }
  toLatex() {
    var l = this.left.toLatex(), r = this.right.toLatex();
    switch (this.op) {
      case '+': return l + ' + ' + r;
      case '-': return l + ' - ' + r;
      case '*': return l + ' \\cdot ' + r;
      case '/': return '\\frac{' + l + '}{' + r + '}';
      case '^': return '{' + l + '}^{' + r + '}';
      default:  return l + ' ' + this.op + ' ' + r;
    }
  }
  toSympy() {
    var l = this.left.toSympy(), r = this.right.toSympy();
    switch (this.op) {
      case '/': return '(' + l + ')/(' + r + ')';
      case '^': return '(' + l + ')**(' + r + ')';
      default:  return '(' + l + ') ' + this.op + ' (' + r + ')';
    }
  }
}
BinaryOpNode.ops = {
  '+': function(a,b) { return a+b; },
  '-': function(a,b) { return a-b; },
  '*': function(a,b) { return a*b; },
  '/': function(a,b) { return Math.abs(b)<1e-10 ? (a>=0?1e10:-1e10) : a/b; },
  '^': function(a,b) {
    if (a<0 && !Number.isInteger(b)) return NaN;
    var r = Math.pow(Math.abs(a), b);
    return a<0 ? (Math.round(b)%2===0 ? r : -r) : r;
  },
};

// ============================================================
// SIMPLIFIER — Rule-based algebraic simplification
// ============================================================

function nodesEqual(a, b) {
  if (a.constructor !== b.constructor) return false;
  if (a instanceof ConstantNode) return Math.abs(a.value - b.value) < 1e-9;
  if (a instanceof VariableNode) return a.index === b.index;
  if (a instanceof UnaryOpNode)  return a.op === b.op && nodesEqual(a.child, b.child);
  if (a instanceof BinaryOpNode) return a.op === b.op && nodesEqual(a.left, b.left) && nodesEqual(a.right, b.right);
  return false;
}

function C(v) { return new ConstantNode(v); }
function isC(n)      { return n instanceof ConstantNode; }
function isZero(n)   { return isC(n) && Math.abs(n.value) < 1e-9; }
function isOne(n)    { return isC(n) && Math.abs(n.value - 1) < 1e-9; }
function isNegOne(n) { return isC(n) && Math.abs(n.value + 1) < 1e-9; }
function B(op,l,r)   { return new BinaryOpNode(op, l, r); }
function U(op,c)     { return new UnaryOpNode(op, c); }

function simplifyOnce(node) {
  // Bottom-up recursion first
  if (node instanceof UnaryOpNode) {
    node = U(node.op, simplifyOnce(node.child));
  } else if (node instanceof BinaryOpNode) {
    node = B(node.op, simplifyOnce(node.left), simplifyOnce(node.right));
  }

  // Constant folding
  if (node instanceof BinaryOpNode && isC(node.left) && isC(node.right)) {
    var val = BinaryOpNode.ops[node.op](node.left.value, node.right.value);
    if (isFinite(val) && !isNaN(val)) return C(val);
  }
  if (node instanceof UnaryOpNode && isC(node.child)) {
    var val2 = UnaryOpNode.ops[node.op](node.child.value);
    if (isFinite(val2) && !isNaN(val2)) return C(val2);
  }

  if (node instanceof BinaryOpNode) {
    var op = node.op, l = node.left, r = node.right;

    if (op === '+') {
      if (isZero(l)) return r;
      if (isZero(r)) return l;
      if (nodesEqual(l, r)) return B('*', C(2), l);
      if (r instanceof UnaryOpNode && r.op === 'neg') return B('-', l, r.child);
      // (x + c1) + c2 => x + (c1+c2)
      if (isC(r) && l instanceof BinaryOpNode && l.op==='+' && isC(l.right))
        return B('+', l.left, C(l.right.value + r.value));
    }

    if (op === '-') {
      if (isZero(r)) return l;
      if (isZero(l)) return U('neg', r);
      if (nodesEqual(l, r)) return C(0);
      if (r instanceof UnaryOpNode && r.op==='neg') return B('+', l, r.child);
      // x - x*c = x*(1-c)
    }

    if (op === '*') {
      if (isZero(l) || isZero(r)) return C(0);
      if (isOne(l)) return r;
      if (isOne(r)) return l;
      if (isNegOne(l)) return U('neg', r);
      if (isNegOne(r)) return U('neg', l);
      if (nodesEqual(l, r)) return U('square', l);
      // (-x)*(-y) = x*y
      if (l instanceof UnaryOpNode && l.op==='neg' && r instanceof UnaryOpNode && r.op==='neg')
        return B('*', l.child, r.child);
      // c1*(c2*x) = (c1*c2)*x
      if (isC(l) && r instanceof BinaryOpNode && r.op==='*' && isC(r.left))
        return B('*', C(l.value*r.left.value), r.right);
      if (isC(l) && r instanceof BinaryOpNode && r.op==='*' && isC(r.right))
        return B('*', C(l.value*r.right.value), r.left);
      // x*(1/y) = x/y
      if (r instanceof BinaryOpNode && r.op==='/' && isOne(r.left))
        return B('/', l, r.right);
      // sqrt(x)*sqrt(x) = x
      if (l instanceof UnaryOpNode && l.op==='sqrt' && r instanceof UnaryOpNode && r.op==='sqrt' && nodesEqual(l.child, r.child))
        return l.child.clone();
    }

    if (op === '/') {
      if (isZero(l)) return C(0);
      if (isOne(r)) return l;
      if (isZero(r)) return C(1e10);
      if (nodesEqual(l, r)) return C(1);
      if (isNegOne(r)) return U('neg', l);
      // (a*x)/x = a  or  (x*a)/x = a
      if (l instanceof BinaryOpNode && l.op==='*') {
        if (nodesEqual(l.left, r))  return l.right;
        if (nodesEqual(l.right, r)) return l.left;
      }
      // x/(a*x) = 1/a
      if (r instanceof BinaryOpNode && r.op==='*') {
        if (nodesEqual(l, r.left))  return B('/', C(1), r.right);
        if (nodesEqual(l, r.right)) return B('/', C(1), r.left);
      }
      // (x*a)/(x*b) = a/b
      if (l instanceof BinaryOpNode && l.op==='*' && r instanceof BinaryOpNode && r.op==='*') {
        if (nodesEqual(l.left, r.left))   return B('/', l.right, r.right);
        if (nodesEqual(l.left, r.right))  return B('/', l.right, r.left);
        if (nodesEqual(l.right, r.left))  return B('/', l.left, r.right);
        if (nodesEqual(l.right, r.right)) return B('/', l.left, r.left);
      }
      // c1/c2 => fold
      if (isC(l) && isC(r) && Math.abs(r.value)>1e-9) {
        var v = l.value/r.value;
        if (isFinite(v)) return C(v);
      }
      // (x/a)/b = x/(a*b)
      if (isC(r) && l instanceof BinaryOpNode && l.op==='/' && isC(l.right))
        return B('/', l.left, C(l.right.value*r.value));
      // x/(x/y) = y
      if (r instanceof BinaryOpNode && r.op==='/' && nodesEqual(l, r.left))
        return r.right.clone();
      // sqrt(x)/sqrt(y) = sqrt(x/y)
      if (l instanceof UnaryOpNode && l.op==='sqrt' && r instanceof UnaryOpNode && r.op==='sqrt')
        return U('sqrt', B('/', l.child, r.child));
      // square(x)/x = x
      if (l instanceof UnaryOpNode && l.op==='square' && nodesEqual(l.child, r))
        return r.clone();
      // x/square(x) = 1/x
      if (r instanceof UnaryOpNode && r.op==='square' && nodesEqual(l, r.child))
        return B('/', C(1), l.clone());
      // exp(x)/exp(y) = exp(x-y)
      if (l instanceof UnaryOpNode && l.op==='exp' && r instanceof UnaryOpNode && r.op==='exp')
        return U('exp', B('-', l.child, r.child));
    }

    if (op === '^') {
      if (isZero(r)) return C(1);
      if (isOne(r))  return l;
      if (isZero(l)) return C(0);
      if (isOne(l))  return C(1);
      if (isC(r) && Math.abs(r.value-2)<1e-9) return U('square', l);
      // (x^a)^b = x^(a*b)
      if (l instanceof BinaryOpNode && l.op==='^' && isC(l.right) && isC(r))
        return B('^', l.left, C(l.right.value*r.value));
    }
  }

  if (node instanceof UnaryOpNode) {
    var op2 = node.op, ch = node.child;
    if (op2==='neg' && ch instanceof UnaryOpNode && ch.op==='neg') return ch.child;
    if (op2==='neg' && isZero(ch)) return C(0);
    if (op2==='neg' && isC(ch)) return C(-ch.value);
    if (op2==='square' && ch instanceof UnaryOpNode && ch.op==='sqrt') return ch.child.clone();
    if (op2==='sqrt' && ch instanceof UnaryOpNode && ch.op==='square') return U('abs', ch.child);
    if (op2==='log' && ch instanceof UnaryOpNode && ch.op==='exp') return ch.child.clone();
    if (op2==='exp' && ch instanceof UnaryOpNode && ch.op==='log') return ch.child.clone();
    if (op2==='abs' && ch instanceof UnaryOpNode && ch.op==='abs') return ch.clone();
    if (op2==='abs' && ch instanceof UnaryOpNode && ch.op==='square') return ch.clone();
    if (op2==='square' && ch instanceof UnaryOpNode && ch.op==='neg') return U('square', ch.child);
    if (op2==='abs' && isC(ch)) return C(Math.abs(ch.value));
  }

  return node;
}

function simplify(node) {
  var current = node.clone();
  for (var i = 0; i < 25; i++) {
    var s = simplifyOnce(current);
    var st = s.toString(), ct = current.toString();
    if (st === ct) break;
    current = s;
  }
  return current;
}

// ============================================================
// PHASE 2 — GP Engine
// ============================================================

class RandomTreeGenerator {
  constructor(opts) {
    this.maxDepth  = opts.maxDepth  || 4;
    this.binaryOps = opts.binaryOps || ['+','-','*','/'];
    this.unaryOps  = opts.unaryOps  || ['square','sqrt','log','exp'];
    this.nVars     = opts.nVars     || 1;
    this.constRange= opts.constRange|| [-5,5];
  }
  randomLeaf(varNames) {
    if (Math.random()<0.5 && this.nVars>0) {
      var idx = Math.floor(Math.random()*this.nVars);
      return new VariableNode(idx, varNames?varNames[idx]:('x'+idx));
    }
    var lo=this.constRange[0], hi=this.constRange[1];
    return new ConstantNode(parseFloat((lo+Math.random()*(hi-lo)).toFixed(3)));
  }
  grow(depth, varNames) {
    if (depth===0) return this.randomLeaf(varNames);
    if (Math.random()<0.5 || this.unaryOps.length===0) {
      var op = this.binaryOps[Math.floor(Math.random()*this.binaryOps.length)];
      return new BinaryOpNode(op, this.grow(depth-1,varNames), this.grow(depth-1,varNames));
    }
    var uop = this.unaryOps[Math.floor(Math.random()*this.unaryOps.length)];
    return new UnaryOpNode(uop, this.grow(depth-1,varNames));
  }
  full(depth, varNames) {
    if (depth===0) return this.randomLeaf(varNames);
    if (Math.random()<0.6 || this.unaryOps.length===0) {
      var op = this.binaryOps[Math.floor(Math.random()*this.binaryOps.length)];
      return new BinaryOpNode(op, this.full(depth-1,varNames), this.full(depth-1,varNames));
    }
    var uop = this.unaryOps[Math.floor(Math.random()*this.unaryOps.length)];
    return new UnaryOpNode(uop, this.full(depth-1,varNames));
  }
  rampedHalfAndHalf(varNames) {
    var d = 1+Math.floor(Math.random()*this.maxDepth);
    return Math.random()<0.5 ? this.grow(d,varNames) : this.full(d,varNames);
  }
}

function computeRMSE(tree, X, y) {
  var sum=0, valid=0;
  for (var i=0;i<X.length;i++) {
    var p = tree.evaluate(X[i]);
    if (!isFinite(p)) continue;
    sum += (p-y[i])*(p-y[i]); valid++;
  }
  return valid<2 ? Infinity : Math.sqrt(sum/valid);
}

function computeR2(tree, X, y) {
  var mean = y.reduce(function(a,b){return a+b;},0)/y.length;
  var ss=0, sr=0;
  for (var i=0;i<X.length;i++) {
    var p = tree.evaluate(X[i]);
    if (!isFinite(p)) return -Infinity;
    ss += (y[i]-mean)*(y[i]-mean);
    sr += (y[i]-p)*(y[i]-p);
  }
  return ss<1e-15 ? 1 : 1-sr/ss;
}

function fitness(tree, X, y, lambda) {
  lambda = lambda||0.001;
  var r = computeRMSE(tree, X, y);
  return isFinite(r) ? r + lambda*tree.complexity() : Infinity;
}

function tournamentSelect(population, scores, size) {
  size = size||5;
  var best=null, bs=Infinity;
  for (var i=0;i<size;i++) {
    var idx = Math.floor(Math.random()*population.length);
    if (scores[idx]<bs) { bs=scores[idx]; best=population[idx]; }
  }
  return best;
}

function replaceNode(root, target, replacement) {
  if (root===target) return replacement;
  if (root instanceof BinaryOpNode) {
    root.left  = replaceNode(root.left,  target, replacement);
    root.right = replaceNode(root.right, target, replacement);
  } else if (root instanceof UnaryOpNode) {
    root.child = replaceNode(root.child, target, replacement);
  }
  return root;
}

function crossover(t1, t2) {
  var a=t1.clone(), b=t2.clone();
  var n1=a.allNodes(), n2=b.allNodes();
  if (n1.length<2||n2.length<2) return a;
  var tgt = n1[1+Math.floor(Math.random()*(n1.length-1))];
  var don = n2[Math.floor(Math.random()*n2.length)];
  return replaceNode(a, tgt, don.clone());
}

function mutate(tree, gen, varNames) {
  var t = tree.clone();
  var ns = t.allNodes();
  if (!ns.length) return t;
  var tgt = ns[Math.floor(Math.random()*ns.length)];
  return replaceNode(t, tgt, gen.rampedHalfAndHalf(varNames));
}

function optimizeConstants(tree, X, y, maxIter) {
  maxIter = maxIter||200;
  var consts = [];
  function gather(n) {
    if (n instanceof ConstantNode) consts.push(n);
    else if (n instanceof BinaryOpNode) { gather(n.left); gather(n.right); }
    else if (n instanceof UnaryOpNode)  gather(n.child);
  }
  gather(tree);
  if (!consts.length) return tree;

  var n = consts.length;
  function evalCost(vals) { consts.forEach(function(c,i){c.value=vals[i];}); return computeRMSE(tree,X,y); }
  var init = consts.map(function(c){return c.value;});
  var simplex = [init.slice()];
  for (var i=0;i<n;i++) { var v=init.slice(); v[i]+=(Math.abs(v[i])>0.01?v[i]*0.1:0.1); simplex.push(v); }

  var alpha=1,gamma=2,rho=0.5,sigma=0.5;
  var scores = simplex.map(evalCost);

  for (var iter=0;iter<maxIter;iter++) {
    var order = scores.map(function(s,i){return[s,i];}).sort(function(a,b){return a[0]-b[0];});
    var sorted = order.map(function(x){return simplex[x[1]];});
    var ss = order.map(function(x){return x[0];});
    if (ss[0]<1e-12) break;
    var cen = new Array(n).fill(0);
    for (var ii=0;ii<n;ii++) for(var jj=0;jj<n;jj++) cen[jj]+=sorted[ii][jj]/n;
    var worst=sorted[n];
    var ref=cen.map(function(c,j){return c+alpha*(c-worst[j]);});
    var rs=evalCost(ref);
    if (rs<ss[n-1]&&rs>=ss[0]){sorted[n]=ref;ss[n]=rs;}
    else if(rs<ss[0]){
      var exp=cen.map(function(c,j){return c+gamma*(ref[j]-c);});
      var es=evalCost(exp);
      sorted[n]=es<rs?exp:ref; ss[n]=Math.min(es,rs);
    } else {
      var cont=cen.map(function(c,j){return c+rho*(worst[j]-c);});
      var cs=evalCost(cont);
      if(cs<ss[n]){sorted[n]=cont;ss[n]=cs;}
      else{for(var k=1;k<=n;k++){sorted[k]=sorted[0].map(function(x,j){return x+sigma*(sorted[k][j]-x);});ss[k]=evalCost(sorted[k]);}}
    }
    for(var m=0;m<=n;m++){simplex[m]=sorted[m];scores[m]=ss[m];}
  }
  evalCost(simplex[scores.indexOf(Math.min.apply(null,scores))]);
  return tree;
}

// ============================================================
// PHASE 3 — Pareto Front
// ============================================================

class SRResult {
  constructor(opts) {
    this.tree=opts.tree; this.formula=opts.formula; this.rmse=opts.rmse;
    this.r2=opts.r2; this.complexity=opts.complexity; this.latex=opts.latex; this.sympy=opts.sympy;
  }
}

class ParetoFront {
  constructor() { this.solutions=[]; }
  dominates(a,b) { return a.rmse<=b.rmse&&a.complexity<=b.complexity&&(a.rmse<b.rmse||a.complexity<b.complexity); }
  add(res) {
    this.solutions=this.solutions.filter(function(s){return !this.dominates(res,s);}.bind(this));
    if (!this.solutions.some(function(s){return this.dominates(s,res);}.bind(this))) this.solutions.push(res);
  }
  getSorted() { return this.solutions.slice().sort(function(a,b){return a.complexity-b.complexity;}); }
}

// ============================================================
// PHASE 4 — Public API
// ============================================================

class SRRegressor {
  constructor(opts) {
    opts=opts||{};
    this.nIterations   =opts.nIterations   ||40;
    this.populationSize=opts.populationSize||200;
    this.maxDepth      =opts.maxDepth      ||4;
    this.maxComplexity =opts.maxComplexity ||15;
    this.binaryOps     =opts.binaryOperators||['+','-','*','/'];
    this.unaryOps      =opts.unaryOperators||['square','sqrt','log','exp'];
    this.tournamentSize=opts.tournamentSize||5;
    this.eliteCount    =opts.eliteCount    ||5;
    this.lambda        =opts.lambda        ||0.001;
    this.optimizeConst =opts.optimizeConstants!==false;
    this.paretoFront   =new ParetoFront();
    this._population   =[];
    this._featureNames =[];
    this.onProgress    =opts.onProgress||null;
    this._stopped      =false;
    this._X=null; this._y=null;
  }

  static Builder() {
    var opts={};
    var b={
      nIterations:    function(v){opts.nIterations=v;return b;},
      populationSize: function(v){opts.populationSize=v;return b;},
      maxDepth:       function(v){opts.maxDepth=v;return b;},
      maxComplexity:  function(v){opts.maxComplexity=v;return b;},
      binaryOperators:function(){opts.binaryOperators=Array.from(arguments).flat();return b;},
      unaryOperators: function(){opts.unaryOperators=Array.from(arguments).flat();return b;},
      tournamentSize: function(v){opts.tournamentSize=v;return b;},
      lambda:         function(v){opts.lambda=v;return b;},
      onProgress:     function(fn){opts.onProgress=fn;return b;},
      build: function(){return new SRRegressor(opts);},
    };
    return b;
  }

  stop() { this._stopped=true; }

  _makeResult(tree) {
    var simp = simplify(tree);
    var rmse = computeRMSE(simp, this._X, this._y);
    if (!isFinite(rmse)) return null;
    var r2 = computeR2(simp, this._X, this._y);
    return new SRResult({
      tree:simp, formula:simp.toString(), latex:simp.toLatex(), sympy:simp.toSympy(),
      rmse:rmse, r2:r2, complexity:simp.complexity(),
    });
  }

  async fit(X, y, featureNames) {
    this._stopped=false; this._X=X; this._y=y;
    this._featureNames=featureNames||X[0].map(function(_,i){return 'x'+i;});
    var nVars=X[0].length, varNames=this._featureNames;

    var gen=new RandomTreeGenerator({
      maxDepth:this.maxDepth, binaryOps:this.binaryOps, unaryOps:this.unaryOps,
      nVars:nVars, constRange:[-10,10],
    });

    this._population=[];
    for(var k=0;k<this.populationSize;k++) this._population.push(gen.rampedHalfAndHalf(varNames));

    for (var iter=0; iter<this.nIterations&&!this._stopped; iter++) {
      var self=this;
      var scores=this._population.map(function(t){
        return t.complexity()>self.maxComplexity*2 ? Infinity : fitness(t,X,y,self.lambda);
      });
      var indexed=scores.map(function(s,i){return[s,i];}).sort(function(a,b){return a[0]-b[0];});

      var topK=Math.min(20, indexed.length);
      for (var k2=0;k2<topK;k2++) {
        var t=this._population[indexed[k2][1]];
        if (t.complexity()>this.maxComplexity) continue;
        var res=this._makeResult(t);
        if (res) this.paretoFront.add(res);
      }

      var elites=indexed.slice(0,this.eliteCount).map(function(x){return self._population[x[1]].clone();});
      var nextPop=elites.slice();

      while (nextPop.length<this.populationSize) {
        var rr=Math.random();
        if (rr<0.7) {
          var child=crossover(
            tournamentSelect(this._population,scores,this.tournamentSize),
            tournamentSelect(this._population,scores,this.tournamentSize)
          );
          if (child.complexity()>this.maxComplexity*2) child=gen.rampedHalfAndHalf(varNames);
          nextPop.push(child);
        } else if (rr<0.9) {
          nextPop.push(mutate(tournamentSelect(this._population,scores,this.tournamentSize),gen,varNames));
        } else {
          nextPop.push(gen.rampedHalfAndHalf(varNames));
        }
      }
      this._population=nextPop;

      if (this.optimizeConst && indexed.length>0) {
        var best2=this._population[indexed[0][1]];
        if (best2.complexity()<=this.maxComplexity) {
          optimizeConstants(best2, X, y);
          var res2=this._makeResult(best2);
          if (res2) this.paretoFront.add(res2);
        }
      }

      if (this.onProgress) {
        this.onProgress({
          iteration:iter+1, total:this.nIterations,
          bestScore:indexed[0]?indexed[0][0]:Infinity,
          paretoSize:this.paretoFront.solutions.length,
          bestFormula:this.paretoFront.getSorted()[0]?this.paretoFront.getSorted()[0].formula:'—',
        });
      }

      if (iter%2===0) await new Promise(function(r){setTimeout(r,0);});
    }
    return this;
  }

  getParetoFront() { return this.paretoFront.getSorted(); }
  bestFormula() {
    var s=this.paretoFront.getSorted();
    if (!s.length) return null;
    return s.reduce(function(a,b){return a.r2>b.r2?a:b;});
  }
  predict(X) {
    var best=this.bestFormula();
    if (!best) return X.map(function(){return NaN;});
    return X.map(function(row){return best.tree.evaluate(row);});
  }
}

// ============================================================
// Smart Data Parser — handles CSV, TSV, DAT, space-separated,
// quoted fields, decimal comma, comments, mixed line endings
// ============================================================

/**
 * Detect the most likely field separator in a line.
 * Returns one of: '\t', ';', ',', ' ', '|', '  ' (multi-space)
 */
function detectSeparator(sampleLines) {
  // Score each candidate separator on consistency of field count
  var candidates = ['\t', ';', ',', '|'];
  var scores = {};

  candidates.forEach(function(sep) {
    var counts = sampleLines.map(function(l) { return l.split(sep).length; });
    var first = counts[0];
    if (first < 2) { scores[sep] = -1; return; }
    // Consistency: how many lines have the same count as the first
    var consistent = counts.filter(function(c) { return c === first; }).length;
    scores[sep] = consistent * first; // reward more columns + consistency
  });

  // Also test multi-space / single-space
  var spaceCounts = sampleLines.map(function(l) {
    return l.trim().split(/\s+/).length;
  });
  var spaceFirst = spaceCounts[0];
  if (spaceFirst >= 2) {
    var spaceConsistent = spaceCounts.filter(function(c) { return c === spaceFirst; }).length;
    scores['__space__'] = spaceConsistent * spaceFirst * 0.8; // slight penalty vs explicit sep
  }

  var best = null, bestScore = -1;
  Object.keys(scores).forEach(function(k) {
    if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
  });

  return best === '__space__' ? null : (best || ',');
}

/**
 * Parse a single cell value: strip quotes, handle decimal comma.
 */
function parseCell(raw) {
  var s = raw.trim();
  // Strip surrounding quotes (single or double)
  if ((s[0]==='"'&&s[s.length-1]==='"') || (s[0]==="'"&&s[s.length-1]==="'")) {
    s = s.slice(1,-1).trim();
  }
  // Replace decimal comma (European) — only if no other comma present as separator
  // We replace comma-as-decimal: "3,14" → "3.14" but not "1,000,000" (multiple commas)
  var commaCount = (s.match(/,/g)||[]).length;
  if (commaCount === 1) s = s.replace(',', '.');
  return parseFloat(s);
}

/**
 * Split a line by separator, respecting quoted fields.
 */
function splitLine(line, sep) {
  if (sep === null) {
    // Space-separated: collapse multiple spaces/tabs
    return line.trim().split(/\s+/);
  }
  // Handle quoted fields with the separator inside
  var result = [], current = '', inQuote = false, qChar = '';
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true; qChar = ch;
    } else if (inQuote && ch === qChar) {
      inQuote = false;
    } else if (!inQuote && line.substr(i, sep.length) === sep) {
      result.push(current); current = ''; i += sep.length - 1;
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Check whether a cell is numeric after all conversions.
 */
function isNumericCell(raw) {
  var s = raw.trim();
  if (!s) return false;
  if ((s[0]==='"'&&s[s.length-1]==='"') || (s[0]==="'"&&s[s.length-1]==="'")) s=s.slice(1,-1).trim();
  var commaCount=(s.match(/,/g)||[]).length;
  if(commaCount===1) s=s.replace(',','.');
  return !isNaN(parseFloat(s)) && isFinite(parseFloat(s));
}

function parseCSV(text) {
  // ── Normalise line endings (CRLF, CR, LF)
  var raw = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');

  // ── Split lines, strip BOM, skip blank & comment lines
  var allLines = raw.split('\n');
  var lines = allLines.filter(function(l) {
    var t = l.trim();
    return t.length > 0 && t[0] !== '#' && t[0] !== '!';
  });
  // Strip UTF-8 BOM from first line if present
  if (lines.length && lines[0].charCodeAt(0) === 0xFEFF) {
    lines[0] = lines[0].slice(1);
  }

  if (lines.length < 2) throw new Error('Fichier trop court — au moins une ligne de données requise');

  // ── Detect separator using first 5 data-looking lines
  var sample = lines.slice(0, Math.min(6, lines.length));
  var sep = detectSeparator(sample);

  // ── Check if first line is a header (contains non-numeric cell)
  var firstCells = splitLine(lines[0], sep);
  var isHeader = firstCells.some(function(c) { return !isNumericCell(c); });

  var headers, dataLines;
  if (isHeader) {
    headers = firstCells.map(function(c) { return c.trim().replace(/^["']|["']$/g,''); });
    dataLines = lines.slice(1);
  } else {
    dataLines = lines;
    headers = null;
  }

  // ── Parse data rows — be lenient: skip rows where ANY cell is non-numeric
  var rows = [];
  var expectedCols = -1;
  dataLines.forEach(function(line) {
    var t = line.trim();
    if (!t || t[0]==='#') return;
    var cells = splitLine(t, sep);
    // Determine expected column count from first valid row
    if (expectedCols < 0) expectedCols = cells.length;
    // Accept rows with correct column count (ignore rows that differ by ±0)
    if (cells.length !== expectedCols) return;
    var vals = cells.map(parseCell);
    if (vals.some(function(v) { return !isFinite(v) || isNaN(v); })) return;
    rows.push(vals);
  });

  if (rows.length === 0) throw new Error('Aucune ligne numérique valide trouvée (séparateur détecté: "'+(sep===null?'espace':sep)+'")');

  var nCols = rows[0].length;

  // ── Build default headers if none found
  if (!headers || headers.length !== nCols) {
    var defs = ['x','y_var','z','w','v'];
    headers = [];
    for (var i=0; i<nCols-1; i++) headers.push(defs[i]||('x'+(i+1)));
    headers.push('y');
  }

  // ── Detect separator label for feedback
  var sepLabel = sep==='\t'?'tabulation':sep===';'?'point-virgule':sep===','?'virgule':sep===null?'espace':sep;

  return {
    X: rows.map(function(r) { return r.slice(0,-1); }),
    y: rows.map(function(r) { return r[r.length-1]; }),
    featureNames: headers.slice(0,-1),
    targetName: headers[headers.length-1],
    headers: headers,
    detectedSep: sepLabel,
    nRows: rows.length,
    nCols: nCols,
  };
}

// ============================================================
// Test Cases
// ============================================================

var TEST_CASES = [
  {id:'linear',    name:'1 var — Linéaire: 2x + 3',         vars:['x'],              fn:function(r){return 2*r[0]+3;},                        domain:[[-5,5]],                          description:'f(x) = 2x + 3'},
  {id:'quadratic', name:'1 var — Quadratique: x² - 2x + 1', vars:['x'],              fn:function(r){return r[0]*r[0]-2*r[0]+1;},              domain:[[-4,4]],                          description:'f(x) = x² - 2x + 1'},
  {id:'cubic',     name:'1 var — Cubique: x³ - x',          vars:['x'],              fn:function(r){return Math.pow(r[0],3)-r[0];},           domain:[[-3,3]],                          description:'f(x) = x³ - x'},
  {id:'sinusoidal',name:'1 var — Sinus: sin(x) + 0.5',     vars:['x'],              fn:function(r){return Math.sin(r[0])+0.5;},              domain:[[0,6.28]],                        description:'f(x) = sin(x) + 0.5'},
  {id:'log_growth',name:'1 var — Log: 3·log(x) + 1',       vars:['x'],              fn:function(r){return 3*Math.log(r[0])+1;},              domain:[[0.5,10]],                        description:'f(x) = 3·ln(x) + 1'},
  {id:'bivar_add', name:'2 vars — Additif: x + y²',        vars:['x','y'],          fn:function(r){return r[0]+r[1]*r[1];},                  domain:[[-3,3],[-3,3]],                   description:'f(x,y) = x + y²'},
  {id:'bivar_mult',name:'2 vars — Produit: x·y + x',       vars:['x','y'],          fn:function(r){return r[0]*r[1]+r[0];},                  domain:[[-3,3],[-3,3]],                   description:'f(x,y) = x·y + x'},
  {id:'trivar',    name:'3 vars — Mixte: x² + y - 2z',     vars:['x','y','z'],      fn:function(r){return r[0]*r[0]+r[1]-2*r[2];},           domain:[[-2,2],[-2,2],[-2,2]],            description:'f(x,y,z) = x² + y - 2z'},
  {id:'quadvar',   name:'4 vars — x·y + z/w',              vars:['x','y','z','w'],  fn:function(r){return r[0]*r[1]+(Math.abs(r[3])>0.1?r[2]/r[3]:0);},domain:[[-3,3],[-3,3],[-3,3],[0.5,3]],description:'f(x,y,z,w) = x·y + z/w'},
  {id:'fivevar',   name:'5 vars — x + y² + z - w + v²',   vars:['x','y','z','w','v'],fn:function(r){return r[0]+r[1]*r[1]+r[2]-r[3]+r[4]*r[4];},domain:[[-2,2],[-2,2],[-2,2],[-2,2],[-2,2]],description:'f(x,y,z,w,v) = x + y² + z - w + v²'},
];

function generateTestData(tc, nSamples) {
  nSamples=nSamples||80;
  var X=[],y=[];
  for(var i=0;i<nSamples;i++){
    var row=tc.domain.map(function(d){return d[0]+Math.random()*(d[1]-d[0]);});
    var val=tc.fn(row);
    if(!isFinite(val)) continue;
    X.push(row); y.push(val);
  }
  return {X:X, y:y, featureNames:tc.vars, targetName:'y'};
}

// ============================================================
// Export
// ============================================================

if (typeof window !== 'undefined') {
  window.SR = {
    SRRegressor:SRRegressor, ParetoFront:ParetoFront, SRResult:SRResult,
    Node:Node, ConstantNode:ConstantNode, VariableNode:VariableNode,
    BinaryOpNode:BinaryOpNode, UnaryOpNode:UnaryOpNode,
    parseCSV:parseCSV, generateTestData:generateTestData, TEST_CASES:TEST_CASES,
    computeRMSE:computeRMSE, computeR2:computeR2,
    simplify:simplify, nodesEqual:nodesEqual,
  };
}
if (typeof module !== 'undefined') {
  module.exports = {
    SRRegressor:SRRegressor, ParetoFront:ParetoFront, SRResult:SRResult,
    parseCSV:parseCSV, generateTestData:generateTestData, TEST_CASES:TEST_CASES,
    simplify:simplify,
  };
}
