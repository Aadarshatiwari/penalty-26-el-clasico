export class Shootout {
  constructor(first = 0) {
    this.turn = first;
    this.kicks = [[],[]];
    this.winner = null;
  }
  get goals() {return this.kicks.map(kicks=>kicks.filter(Boolean).length);}
  record(goal) {
    if (this.winner !== null) throw new Error('Shootout is complete');
    this.kicks[this.turn].push(Boolean(goal));
    this.turn = 1-this.turn;
    const [a,b] = this.goals, [n,m] = this.kicks.map(k=>k.length);
    if (n<=5 && m<=5) {
      if (a>b+5-m) this.winner=0;
      if (b>a+5-n) this.winner=1;
    } else if (n===m && a!==b) this.winner = a>b ? 0 : 1;
    return this.winner;
  }
}
