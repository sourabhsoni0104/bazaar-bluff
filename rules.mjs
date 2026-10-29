export function validAllocation(a,total,exact=false){return Array.isArray(a)&&a.every(n=>Number.isSafeInteger(n)&&n>=0)&& (exact?a.reduce((s,n)=>s+n,0)===total:a.reduce((s,n)=>s+n,0)<=total);}
// The proposal(s) with the most approvals pass. Tied leaders all pass; nothing passes if nobody approved anything.
export function chooseProposals(counts){let best=Math.max(0,...counts);return best>0?counts.map((n,i)=>n===best?i:-1).filter(i=>i>=0):[];}
// Passed proposals add together: each seat's army is the sum of its share in every passed proposal.
export function combineShares(proposals,seats){return Array.from({length:seats},(_,i)=>proposals.reduce((n,p)=>n+p.shares[i],0));}
export function scoreBattle(deployments,values,tie='split'){let scores=deployments.map(()=>0),wins=deployments.map(()=>0);let fields=values.map((value,f)=>{let max=Math.max(...deployments.map(d=>d[f]));// A battlefield nobody sent troops to is unclaimed: no winners, no points.
let winners=max<=0?[]:deployments.map((d,i)=>d[f]===max?i:-1).filter(i=>i>=0);let points=!winners.length||winners.length>1&&tie==='none'?0:value/winners.length;for(let i of winners){scores[i]+=points;if(points)wins[i]++;}return {winners,points,troops:deployments.map(d=>d[f])};});return {scores,wins,fields};}
