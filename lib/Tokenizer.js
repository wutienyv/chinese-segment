'use strict';

class Tokenizer {
  constructor(segment) {
    this.segment = segment;
  }

  split(text, modules) {
    if (modules.length < 1) {
      throw Error('No tokenizer module!');
    } else {
      let ret = [{w: text}];
      for (let module of modules) {
        ret = module.split(ret);
      }
      return ret;
    }
  }
}

module.exports = Tokenizer;

