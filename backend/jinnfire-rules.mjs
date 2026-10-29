const gcd=(a,b)=>{a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a||1n;};
export function fraction(n,d=1n){n=BigInt(n);d=BigInt(d);if(d===0n)throw Error('Zero denominator');if(d<0n){n=-n;d=-d;}let g=gcd(n,d);return {n:String(n/g),d:String(d/g)};}
export const validQuantity=q=>Number.isInteger(q)&&q>=0&&q<=15;
export const addFractions=(a,b)=>fraction(BigInt(a.n)*BigInt(b.d)+BigInt(b.n)*BigInt(a.d),BigInt(a.d)*BigInt(b.d));
export const compareFractions=(a,b)=>{let n=BigInt(a.n)*BigInt(b.d)-BigInt(b.n)*BigInt(a.d);return n>0n?1:n<0n?-1:0;};
export function decimalValue(a){return Number(a.n)/Number(a.d);}
export function decimalString(a,places=2){let n=BigInt(a.n),d=BigInt(a.d),neg=n<0n;if(neg)n=-n;let scale=10n**BigInt(places),rounded=(n*scale*2n+d)/(2n*d);return (neg&&rounded?'−':'')+String(rounded/scale)+(places?'.'+String(rounded%scale).padStart(places,'0'):'');}
export function settleMarket(outputs,demand){if(!Number.isSafeInteger(demand)||demand<=0||demand>1000000)throw Error('Demand must be an integer from 1 to 1,000,000');if(!outputs.every(validQuantity))throw Error('Quantity must be an integer from 0 to 15');let supply=outputs.reduce((s,q)=>s+q,0),D=BigInt(demand),Q=BigInt(supply);let rate=fraction(10n*(2n*D*D-Q*Q),D*D);return {supply,rate,profits:outputs.map(q=>fraction(BigInt(q)*BigInt(rate.n),rate.d))};}
export function rankScores(scores){return scores.map(s=>1+scores.filter(o=>compareFractions(o,s)>0).length);}
