import { expect, test } from "bun:test";
import { toESModule } from "./esm.ts";

// Skeleton of what `elm make --output=x.js` emits.
const iife = `(function(scope){
'use strict';
var $elm$core$Maybe$Just = function (a) { return {$: 'Just', a: a}; };
function _Platform_export(exports)
{
	scope['Elm']
		? _Platform_mergeExportsProd(scope['Elm'], exports)
		: scope['Elm'] = exports;
}
function _Platform_mergeExports(moduleName, obj, exports)
{
	for (var name in exports)
	{
		(name in obj)
			? (name == 'init')
				? _Debug_crash(6, moduleName)
				: _Platform_mergeExports(moduleName + '.' + name, obj[name], exports[name])
			: (obj[name] = exports[name]);
	}
}
var $author$project$Main$main = 42;
_Platform_export({'Main':{'init':$author$project$Main$main(
	$elm$json$Json$Decode$succeed(_Utils_Tuple0))(0)}});}(this));`;

test("rewrites Elm's IIFE into a module exporting Elm", () => {
  const esm = toESModule(iife);
  expect(esm).toContain("// -- (function(scope){");
  expect(esm).toContain("// -- 'use strict';");
  expect(esm).toContain("export const Elm = {'Main':{'init':$author$project$Main$main(");
  expect(esm).toContain("export default Elm;");
  // `scope` is no longer defined, so the original export call must be commented out.
  expect(esm).toMatch(/\/\*\n_Platform_export\(/);
});

test("throws on unexpected input", () => {
  expect(() => toESModule("console.log(1)")).toThrow(/_Platform_export/);
});
