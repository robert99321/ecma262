"use strict";

function Search(menu) {
  this.menu = menu;
  this.$searchBox = document.getElementById('menu-search-box');
  this.$searchResults = document.getElementById('menu-search-results');
  
  this.loadBiblio();
  
  document.addEventListener('keydown', this.documentKeydown.bind(this));
  
  this.$searchBox.addEventListener('keydown', debounce(this.searchBoxKeydown.bind(this)));
  this.$searchBox.addEventListener('keyup', debounce(this.searchBoxKeyup.bind(this)));
}

Search.prototype.loadBiblio = function () {
  var $biblio = document.getElementById('menu-search-biblio');
  if (!$biblio) {
    this.biblio = {};
  } else {
    this.biblio = JSON.parse($biblio.textContent);
    var seenKeys = {};
    this._corpus = [];
    
    Object.keys(this.biblio).forEach(function (kind) {
      Object.keys(this.biblio[kind]).forEach(function (recordName) {
        var record = this.biblio[kind][recordName];
        var key;
  
        if (kind === 'ops') {
          key = record.aoid;
        } else if (kind === 'productions') {
          key = record.name;
        } else if (kind === 'clauses') {
          key = record.title;
        } else {
          return;
        }
  
        if (seenKeys[key]) {
          return;
        }
  
        seenKeys[key] = true;
  
        this._corpus.push({ kind: kind, key: key, record: record });
      }, this)
    }, this);
  }
}

Search.prototype.documentKeydown = function (e) {
  if (e.keyCode === 191) {
    e.preventDefault();
    e.stopPropagation();
    this.triggerSearch();
  }
}

Search.prototype.searchBoxKeydown = function (e) {
  e.stopPropagation();
  
  if (e.keyCode === 191 && e.target.value.length === 0) {
    e.preventDefault();
  } else if (e.keyCode === 13) {
    e.preventDefault();
    this.selectResult();
  }
}

Search.prototype.searchBoxKeyup = function (e) {
  e.stopPropagation();
  this.search(e.target.value);
}


Search.prototype.triggerSearch = function (e) {
  if (this.menu.isVisible()) {
    this._closeAfterSearch = false;
  } else {
    this._closeAfterSearch = true;
    this.menu.show();
  }

  this.$searchBox.focus();
}
// bit 12 - Set if the result starts with searchString
// bits 8-11: 8 - number of chunks multiplied by 2 if cases match, otherwise 1.
// bits 1-7: 127 - length of the entry
// General scheme: prefer case sensitive matches with fewer chunks, and otherwise
// prefer shorter matches.
function relevance(result, searchString) {
  var relevance = 0;
  
  relevance = Math.max(0, 8 - result.match.chunks) << 7;
  
  if (result.match.caseMatch) {
    relevance *= 2;
  }
  
  if (result.match.prefix) {
    relevance += 2048
  }
  
  relevance += Math.max(0, 255 - result.entry.key.length);
  
  return relevance;
}

Search.prototype.search = function (searchString) {
  var s = Date.now();
  if (searchString.length < 2) {
    this.hideSearch();
    return;
  } else {
    this.showSearch();
  }
  
  var results;

  if (/^[\d\.]*$/.test(searchString)) {
    results = Object.keys(this.biblio.clauses).map(function (clauseName) {
      return this.biblio.clauses[clauseName];
    }, this).filter(function (clause) {
      return clause.number.substring(0, searchString.length) === searchString;
    }).map(function (clause) {
      return { entry: { kind: 'clauses', key: clause.title, record: clause } };
    });
  } else {
    results = [];
    
    this._corpus.forEach(function (entry) {
      var result = {};
  
      var match = fuzzysearch(searchString, entry.key);
      if (match) {
        results.push({ entry: entry, match: match });
      }
    })
  
    results.forEach(function (result) {
      result.relevance = relevance(result, searchString);
    });
    
    results = results.sort(function (a, b) { return b.relevance - a.relevance });

  }

  if (results.length > 50) {
    results = results.slice(0, 50);
  }

  console.log("Search took " + (Date.now() - s));
  this.displayResults(results);
}
Search.prototype.hideSearch = function () {
  this.$searchResults.classList.add('inactive');
}

Search.prototype.showSearch = function () {
  this.$searchResults.classList.remove('inactive');
}

Search.prototype.selectResult = function () {
  var $first = this.$searchResults.querySelector('li:first-child a');

  if ($first) {
    document.location = $first.getAttribute('href');
  }

  this.$searchBox.value = '';
  this.$searchBox.blur();
  this.hideSearch();

  if (this._closeAfterSearch) {
    this.menu.hide();
  }
}

Search.prototype.displayResults = function (results) {
  if (results.length > 0) {
    this.$searchResults.classList.remove('no-results');
    
    var html = '<ul>';

    results.forEach(function (result) {
      var entry = result.entry;

      if (entry.kind === 'clauses') {
        html += '<li class=menu-search-result-op><a href="#' + entry.record.id + '">' + entry.record.number + ' ' + entry.key + '</a></li>'
      } else if (entry.kind === 'productions') {
        html += '<li class=menu-search-result-op><a href="#' + entry.record.id + '">' + entry.key + '</a></li>'
      } else if (entry.kind === 'ops') {
        html += '<li class=menu-search-result-op><a href="#' + entry.record.id + '">' + entry.key + '</a></li>'
      }
    });

    html += '</ul>'

    this.$searchResults.innerHTML = html;
  } else {
    this.$searchResults.innerHTML = '';
    this.$searchResults.classList.add('no-results');
  }
}
/*
  } else if (e.keyCode === 84) {
    this.toggleTraceEntry();
  } else if (e.keyCode > 48 && e.keyCode < 58) {
    this.selectTrace(e.keyCode - 49);
  }
}
*/

function Menu() {
  this.$toggle = document.getElementById('menu-toggle');
  this.$menu = document.getElementById('menu');
  this.$traceList = document.getElementById('menu-trace-list');
  this.$toc = document.querySelector('#menu-toc > ol');
  this.$search = new Search(this);
  
  this._tracedIds = {}; 

  this.$toggle.addEventListener('click', this.toggle.bind(this));

  var tocItems = this.$menu.querySelectorAll('#menu-toc li');
  for (var i = 0; i < tocItems.length; i++) {
    var $item = tocItems[i];
    $item.addEventListener('click', function($item, event) {
      $item.classList.toggle('active');
      event.stopPropagation();
    }.bind(null, $item));
  }

  var tocLinks = this.$menu.querySelectorAll('#menu-toc li > a');
  for (var i = 0; i < tocLinks.length; i++) {
    var $link = tocLinks[i];
    $link.addEventListener('click', function(event) {
      this.toggle();
      event.stopPropagation();
    }.bind(this));
  }
  
  document.addEventListener('scroll', debounce(function () {
    this.$activeClause = findActiveClause(document.body);
    this.revealInToc(this.$activeClause);
  }.bind(this)));
  this.$activeClause = findActiveClause(document.body);
}

Menu.prototype.revealInToc = function (path) {
  var current = this.$toc.querySelectorAll('li.revealed');
  for (var i = 0; i < current.length; i++) {
    current[i].classList.remove('revealed');
    current[i].classList.remove('revealed-leaf');
  }
  
  var current = this.$toc;
  var index = 0;
  while (index < path.length) {
    var children = current.children;
    for ( var i = 0; i < children.length; i++) {
      if ( '#' + path[index].id === children[i].children[1].getAttribute('href') ) {
        children[i].classList.add('revealed');
        if (index === path.length - 1) {
          children[i].classList.add('revealed-leaf');
          
          var rect = children[i].getBoundingClientRect();
          if (rect.top + 10 > window.innerHeight) {
            this.$menu.scrollTop = this.$menu.scrollTop + rect.bottom - window.innerHeight;
          } else if (rect.top < 0) {
            this.$menu.scrollTop = this.$menu.scrollTop + rect.top;
          }
        }
        current = children[i].querySelector('ol');
        index++;
        break;
      }      
    }
    
  }
}

function findActiveClause(root, path) {
  var clauses = new ClauseWalker(root);
  var $clause;
  var found = false;
  var path = path || [];
  
  while ($clause = clauses.nextNode()) {
    var rect = $clause.getBoundingClientRect();
    
    if (rect.top <= 9 && rect.bottom > 0) {
      found = true;
      return findActiveClause($clause, path.concat($clause)) || path;
    } else if (found) {
      break;
    }
  }
  
  return path;
}

function ClauseWalker(root) {
  var previous;
  var treeWalker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: function (node) {
        if (previous === node.parentNode) {
          return NodeFilter.FILTER_REJECT;
        } else {
          previous = node;
        }
        if (node.nodeName === 'EMU-CLAUSE' || node.name === 'EMU-INTRO' || node.name === 'EMU-ANNEX') {
          return NodeFilter.FILTER_ACCEPT;
        } else {
          return NodeFilter.FILTER_SKIP;
        }
      }
    },
    false
    );
  
  return treeWalker;
}
Menu.prototype.toggle = function () {
  this.$menu.classList.toggle('active');
}

Menu.prototype.show = function () {
  this.$menu.classList.add('active');
}

Menu.prototype.hide = function () {
  this.$menu.classList.remove('active');
}

Menu.prototype.isVisible = function() {
  return this.$menu.classList.contains('active');
}




Menu.prototype.addTraceEntry = function () {
  var $clause = this.$activeClause[this.$activeClause.length - 1];
  var id = $clause.id;
  var header = $clause.children[0];
  var title = header.children[1].innerHTML;
  var secnum = header.children[0].outerHTML;
  this.$traceList.innerHTML += '<li><a href="#' + id + '">' + secnum + title + '</a></li>';
  this._tracedIds[id] = true;
}

Menu.prototype.removeTraceEntry = function () {
  var $clause = this.$activeClause[this.$activeClause.length - 1];
  var id = $clause.id;
  var item = this.$traceList.querySelector('a[href="#' + id + '"]').parentNode;
  this.$traceList.removeChild(item);
  delete this._tracedIds[id];
}

Menu.prototype.toggleTraceEntry = function () {
  var start = this.$activeClause[this.$activeClause.length - 1].id;
  if (this._tracedIds[start]) {
    this.removeTraceEntry();
  } else {
    this.addTraceEntry();
  }
}

Menu.prototype.selectTrace = function (num) {
  document.location = this.$traceList.children[num].children[0].href;
}

function init() {
  var menu = new Menu();
}

document.addEventListener('DOMContentLoaded', init);

function debounce(fn) {
  var timeout;
  return function() {
    var args = arguments;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(function() {
      timeout = null;
      fn.apply(this, args);
    }.bind(this), 150);
  }
}




var CLAUSE_NODES = ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX'];
function findLocalReferences ($elem) {
  var name = $elem.innerHTML;
  var references = [];

  var parentClause = $elem.parentNode;
  while (parentClause && CLAUSE_NODES.indexOf(parentClause.nodeName) === -1) {
    parentClause = parentClause.parentNode;
  }

  if(!parentClause) return;

  var vars = parentClause.querySelectorAll('var');

  for (var i = 0; i < vars.length; i++) {
    var $var = vars[i];

    if ($var.innerHTML === name) {
      references.push($var);
    }
  }

  return references;
}

function toggleFindLocalReferences($elem) {
  var references = findLocalReferences($elem);
  if ($elem.classList.contains('referenced')) {
    references.forEach(function ($reference) {
      $reference.classList.remove('referenced');
    });
  } else {
    references.forEach(function ($reference) {
      $reference.classList.add('referenced');
    });
  }
}

function installFindLocalReferences () {
  document.addEventListener('click', function (e) {
    if (e.target.nodeName === 'VAR') {
      toggleFindLocalReferences(e.target);
    }
  });
}

document.addEventListener('DOMContentLoaded', installFindLocalReferences);




// The following license applies to the fuzzysearch function
// The MIT License (MIT)
// Copyright © 2015 Nicolas Bevacqua
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
function fuzzysearch (searchString, haystack, caseInsensitive) {
  var tlen = haystack.length;
  var qlen = searchString.length;
  var chunks = 1;
  var finding = false;
  var prefix = true;
  
  if (qlen > tlen) {
    return false;
  }
  
  if (qlen === tlen) {
    if (searchString === haystack) {
      return { caseMatch: true, chunks: 1, prefix: true };
    } else if (searchString.toLowerCase() === haystack.toLowerCase()) {
      return { caseMatch: false, chunks: 1, prefix: true };
    } else {
      return false;
    }
  }
  
  outer: for (var i = 0, j = 0; i < qlen; i++) {
    var nch = searchString[i];
    while (j < tlen) {
      var targetChar = haystack[j++];
      if (targetChar === nch) {
        finding = true;
        continue outer;
      }
      if (finding) {
        chunks++;
        finding = false;
      }
    }
    
    if (caseInsensitive) { return false }
    
    return fuzzysearch(searchString.toLowerCase(), haystack.toLowerCase(), true);
  }
  
  return { caseMatch: !caseInsensitive, chunks: chunks, prefix: j <= qlen };
}