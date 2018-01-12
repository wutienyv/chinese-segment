'use strict';

const fs = require('fs');
const path = require('path');
const POSTAG = require('./POSTAG');
const Tokenizer = require('./Tokenizer');
const Optimizer = require('./Optimizer');

const debug = console.log;


class Segment {
  constructor(){
    this.POSTAG = POSTAG; // 词性
    this.DICT = {};       // 词典表
    this.modules = {
      tokenizer:  [],     // 分词模块
      optimizer:  []      // 优化模块
    };
    this.tokenizer = new Tokenizer(this);
    this.optimizer = new Optimizer(this);
  }

  use(module) {
    let me = this;

    if (Array.isArray(module)) {
      module.forEach((module)=> {
        me.use(module[i]);
      });

    } else {
      if (typeof module == 'string') {
        let filename = path.resolve(__dirname, 'module', module + '.js');
        if (!fs.existsSync(filename)) {
          throw Error('Cannot find module "' + module + '".');
        } else {
          module = require(filename);
        }
      }
      module.init(this);
      this.modules[module.type].push(module);
    }

    return this;
  }

  _resolveDictFilename(name) {
    let filename = path.resolve(name);
    if (!fs.existsSync(filename)) {
      filename = path.resolve(__dirname, '../dicts', name);
      if (!fs.existsSync(filename)) {
        throw Error('Cannot find dict file "' + filename + '".');
      }
    }
    return filename;
  }

  loadDict(name, type, convert_to_lower) {
    let filename = this._resolveDictFilename(name);
    if (!type)  type = 'TABLE'; 
    if (!this.DICT[type]) this.DICT[type] = {};
    if (!this.DICT[type + '2']) this.DICT[type + '2'] = {};
    let TABLE = this.DICT[type];        
    let TABLE2 = this.DICT[type + '2']; 
    let POSTAG = this.POSTAG;
    let data = fs.readFileSync(filename, 'utf8');
    if (convert_to_lower) data = data.toLowerCase();

    data.split(/\r?\n/).forEach((line)=> {
      let blocks = line.split('|');
      if (blocks.length > 2) {
        let w = blocks[0].trim();
        let p = Number(blocks[1]);
        let f = Number(blocks[2]);
        if (w.length > 0) {
          TABLE[w] = {f: f, p: p};
          if (!TABLE2[w.length]) TABLE2[w.length] = {};
          TABLE2[w.length][w] = TABLE[w];
        }
      }
    });

    return this;
  }

  getDict(type) {
    return this.DICT[type];
  }

  loadSynonymDict(name) {
    let filename = this._resolveDictFilename(name);
    let type = 'SYNONYM';

    if (!this.DICT[type]) this.DICT[type] = {};
    let TABLE = this.DICT[type];     
    let data = fs.readFileSync(filename, 'utf8');

    data.split(/\r?\n/).forEach((line)=> {
      let blocks = line.split(',');
      if (blocks.length > 1) {
        let n1 = blocks[0].trim();
        let n2 = blocks[1].trim();
        TABLE[n1] = n2;
        if (TABLE[n2] === n1) {
          delete TABLE[n2];
        }
      }
    });

    return this;
  }

  loadStopwordDict(name) {
    let filename = this._resolveDictFilename(name);
    let type = 'STOPWORD';

    if (!this.DICT[type]) this.DICT[type] = {};
    let TABLE = this.DICT[type];   
    let data = fs.readFileSync(filename, 'utf8');

    data.split(/\r?\n/).forEach((line)=> {
      line = line.trim();
      if (line) {
        TABLE[line] = true;
      }
    });

    return this;
  }

  useDefault() {
    this
      .use('URLTokenizer')            // URL识别
      .use('WildcardTokenizer')       // 通配符，必须在标点符号识别之前
      .use('PunctuationTokenizer')    // 标点符号识别
      .use('ForeignTokenizer')        // 外文字符、数字识别，必须在标点符号识别之后

      .use('DictTokenizer')           // 词典识别
      .use('ChsNameTokenizer')        // 人名识别，建议在词典识别之后

      .use('EmailOptimizer')          // 邮箱地址识别
      .use('ChsNameOptimizer')        // 人名识别优化
      .use('DictOptimizer')           // 词典识别优化
      .use('DatetimeOptimizer')       // 日期时间识别优化

      .loadDict('dict.txt')           // 盘古词典
      .loadDict('dict2.txt')          // 扩展词典（用于调整原盘古词典）
      .loadDict('dict3.txt')          // 扩展词典（用于调整原盘古词典）
      .loadDict('names.txt')          // 常见名词、人名
      .loadDict('wildcard.txt', 'WILDCARD', true)   // 通配符
      .loadSynonymDict('synonym.txt')   // 同义词
      .loadStopwordDict('stopword.txt') // 停止符
    ;
    return this;
  }

  doSegment(text, options) {
    let me = this;
    options = options || {};
    let ret = [];

    text.replace(/\r/g, '\n').split(/(\n|\s)+/).forEach((section)=> {
      section = section.trim();
      if (section.length < 1) return;
      let sret = me.tokenizer.split(section, me.modules.tokenizer);
      sret = me.optimizer.doOptimize(sret, me.modules.optimizer);

      if (sret.length > 0) ret = [ ...ret, ...sret];
    });

    if (options.stripPunctuation) {
      ret = ret.filter((item)=> {
        return item.p !== POSTAG.D_W;
      });
    }

    function convertSynonym (list) {
      let count = 0;
      let TABLE = me.getDict('SYNONYM');
      list = list.map((item)=> {
        if (item.w in TABLE) {
          count++;
          return {w: TABLE[item.w], p: item.p};
        } else {
          return item;
        }
      });
      return { count, list };
    }
    if (options.convertSynonym) {
      do {
        let result = convertSynonym(ret);
        ret = result.list;
      } while (result.count > 0);
    }

    if (options.stripStopword) {
      let STOPWORD = me.getDict('STOPWORD');
      ret = ret.filter((item)=> {
        return !(item.w in STOPWORD);
      });
    }

    if (options.simple) {
      ret = ret.map((item)=> {
        return item.w;
      });
    }

    return ret;
  }

  toString(words) {
    return words.map((item)=> {
      return item.w;
    }).join('');
  };

  split(words, s) {
    let ret = [];
    let lasti = 0;
    let i = 0;
    let f = typeof s === 'string' ? 'w' : 'p';

    while (i < words.length) {
      if (words[i][f] == s) {
        if (lasti < i) ret.push(words.slice(lasti, i));
        ret.push(words.slice(i, i + 1));
        i++;
        lasti = i;
      } else {
        i++;
      }
    }
    if (lasti < words.length - 1) {
      ret.push(words.slice(lasti, words.length));
    }

    return ret;
  }

  indexOf(words, s, cur) {
    cur = isNaN(cur) ? 0 : cur;
    let f = typeof s === 'string' ? 'w' : 'p';

    while (cur < words.length) {
      if (words[cur][f] == s) return cur;
      cur++;
    }

    return -1;
  };

}

module.exports = Segment;
