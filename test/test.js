var assert = require("assert");

var parser = require("..");

describe("parser", () => {
	it("parses booleans", () => {
		assert.equal(
			parser.parseString("true", true),
			true);
		assert.equal(
			parser.parseString("false", true),
			false);
	});

	it("parses null", () => {
		assert.equal(
			parser.parseString("null", true),
			null);
	});

	it("parses numbers", () => {
		assert.equal(
			parser.parseString("105", true),
			105);
		assert.equal(
			parser.parseString("103.995", true),
			103.995);
		assert.equal(
			parser.parseString("-10", true),
			-10);
	});
	it("parses positive exponential notation", () => {
		assert.equal(
			parser.parseString("105.99e5", true),
			105.99e5);
		assert.equal(
			parser.parseString("105.99e+5", true),
			105.99e5);
		assert.equal(
			parser.parseString("105.99E5", true),
			105.99e5);
		assert.equal(
			parser.parseString("105.99E+5", true),
			105.99e5);
	});
	it("parses negative exponential notation", () => {
		assert.equal(
			parser.parseString("105.99e-5", true),
			105.99e-5);
		assert.equal(
			parser.parseString("105.99E-5", true),
			105.99E-5);
	});
	it("only accepts one period in numbers", () => {
		assert.equal(
			parser.parseString("10.44.55", true),
			10.44);
	});

	it("parses strings", () => {
		assert.equal(
			parser.parseString("\"Hello World\"", true),
			"Hello World");
	});
	it("parses strings without quotes", () => {
		assert.equal(
			parser.parseString("hello-world", true),
			"hello-world");
	});

	it("parses arrays", () => {
		assert.deepEqual(
			parser.parseString("[10 50 449 true]", true),
			[10, 50, 449, true]);
	});
	it("parses nested arrays", () => {
		assert.deepEqual(
			parser.parseString("[10 [ [ 3 7 ] 55 6]]", true),
			[10, [ [3, 7 ], 55, 6]]);
	});

	it("parses objects", () => {
		assert.deepEqual(
			parser.parseString("{ foo 10 bar 555 }", true),
			{ foo: 10, bar: 555 });
	});
	it("parses nested objects", () => {
		assert.deepEqual(
			parser.parseString("{ foo 10 bar { no 4 hey 33 } }", true),
			{ foo: 10, bar: { no: 4, hey: 33 } });
	});
});

describe("interface", () => {
	describe("parseFile", () => {
		it("parses the example file correctly", () => {
			assert.deepEqual(
				parser.parseFile("test/parse-file.hcnf"),
				{ foo: { bar: 55, baz: "Hello World" }, bar: 10 });
		});
		it("parses the example file with a root correctly", () => {
			assert.deepEqual(
				parser.parseFile("test/parse-file-root.hcnf", true),
				[ 10, 5, "no" ]);
		});
	});

	describe("parseConfFile", () => {
		it("parses the example file correctly", () => {
			assert.deepEqual(
				parser.parseConfFile("test/parse-conf-file.hcnf"),
				{
					foo: [
						{ name: "bar", baz: 10 },
						{ name: "no", baz: 99 },
					],
					bar: [
						{ name: null, a: "b" }
					]
				});
		});
	});

	describe("parseConfString", () => {
		it("parses the example string correctly", () => {
			assert.deepEqual(
				parser.parseConfString(
					"foo bar { baz 10 } foo no { baz 20 }"),
				{
					foo: [
						{ name: "bar", baz: 10 },
						{ name: "no", baz: 20 },
					]
				});
		});
	});
});
