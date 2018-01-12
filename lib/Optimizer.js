'use strict';

class Optimizer {
  constructor(segment) {
  	this.segment = segment;
  }

  doOptimize(words, modules) {
  	for (let module of modules) {
  	  words = module.doOptimize(words);
  	}
  	return words;
  }
}

module.exports = Optimizer;

