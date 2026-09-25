/**
 * Safety net for pages that browser translation (Chrome/Google Translate) or extensions
 * have rewritten - React issue #11538.
 *
 * Google Translate moves every text node into `<font>` wrappers. When React later removes
 * one of the text nodes it rendered, or inserts a node before one, the node is no longer a
 * child of the parent React remembers and the DOM throws `NotFoundError`, which takes the
 * whole page down ("Something went wrong"). The components are written so React does not
 * do that (changing text sits in its own keyed element, see DECISIONS.md); this script only
 * covers what slips through, including third-party components:
 *
 *  - removeChild(child) of a node that is not a child: nothing to remove, return the node;
 *  - insertBefore(node, ref) with a ref that is not a child: append instead of throwing.
 *
 * Both cases are impossible in an untouched DOM, so normal use never reaches them. Every
 * hit is counted in `window.__domGuardHits` (the first 20 described in `window.__domGuardLog`)
 * and reported with console.warn, so it is not
 * silent: the translation e2e test (tests/e2e/translation.spec.ts) asserts the counter
 * stays at 0, i.e. the source-level fixes alone keep a translated page working.
 *
 * Inlined in the root layout <head>, so it runs before React hydrates. Keep it tiny and
 * dependency-free.
 */
export const DOM_GUARD_SCRIPT = `(function(){try{if(typeof Node!=='function'||!Node.prototype||Node.prototype.__sfGuard)return;var P=Node.prototype;P.__sfGuard=true;window.__domGuardHits=0;var log=window.__domGuardLog=[];var hit=function(what,node,parent){window.__domGuardHits++;if(log.length<20)log.push(what+' '+(node&&node.nodeName)+' '+JSON.stringify(String(node&&node.textContent).slice(0,40))+' in '+(parent&&parent.nodeName)+'.'+String(parent&&parent.className).slice(0,40));if(window.console&&console.warn)console.warn('[dom-guard] '+what+': the node was moved by a browser translation or an extension',node);};var rc=P.removeChild;P.removeChild=function(child){if(child&&child.parentNode!==this){hit('removeChild',child,this);return child;}return rc.apply(this,arguments);};var ib=P.insertBefore;P.insertBefore=function(node,ref){if(ref&&ref.parentNode!==this){hit('insertBefore',ref,this);return ib.call(this,node,null);}return ib.apply(this,arguments);};}catch(_){}})();`;
