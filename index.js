var fs = require("fs");
var pathlib = require("path");

exports.parseFile = parseFile;
exports.parseString = parseString;
exports.parseConfFile = parseConfFile;
exports.parseConfString = parseConfString;

class Enum {
	constructor(...vals) {
		var i = 1;
		this._strs = [];
		vals.forEach(j => {
			this[j] = i;
			this._strs[i] = j;
			i += 1;
		});
	}

	match(val, obj) {
		var res = obj[this.str(val)];
		return res;
	}

	str(val) {
		return this._strs[val];
	}
}

var TokenTypes = new Enum(
	"STRING",
	"NUMBER",
	"BOOL",
	"NULL",
	"EOF",
	"OPENBRACKET",
	"CLOSEBRACKET",
	"OPENBRACE",
	"CLOSEBRACE",
	"UNKNOWN");

function expandEnv(stream, token, str) {
	var rx = /\$\((\S+)\)/;
	var ret = "";
	while (rx.test(str)) {
		var m = str.match(rx);
		if (m === null)
			break;

		ret += str.substr(0, m.index);
		ret += process.env[m[1]];
		if (process.env[m[1]] === undefined) {
			stream.warn(token, "Environment variable "+m[1]+" doesn't exist");
		}
		str = str.substr(m.index + m[0].length);
	}
	return ret + str;
}

function makeToken(type, linenr, content, isQuoted) {
	if (content == null) {
		content = TokenTypes.match(type, {
			STRING: "[string]",
			NUMBER: "[number]",
			BOOL: "[bool]",
			NULL: "[null]",
			EOF: "[eof]",
			OPENBRACKET: "[",
			CLOSEBRACKET: "]",
			OPENBRACE: "{",
			CLOSEBRACE: "}",
			UNKNOWN: "[unknown]",
		});
	}
	return { type, linenr, content, isQuoted };
}

function isspace(ch) {
	return ch == ' ' || ch == '\r' || ch == '\t' || ch == '\n' || ch == null;
}

class TokenStream {
	constructor() {
		this.linenr = 1;
		this.prevChar = null;
		this.currChar = null;
		this.nextChar = null;

		this.currToken = null;
	}

	init() {
		this.readChar();
		this.readToken();
	}

	_nextChar() {
		throw new Error("_nextChar is not implemented.");
	}

	readChar() {
		var c = this._nextChar();
		this.prevChar = this.currChar;
		this.currChar = this.nextChar;
		this.nextChar = c;

		if (this.prevChar == "\n")
			this.linenr += 1;
	}

	_nextToken() {
		this.readChar();
		var curr = this.currChar;
		var next = this.nextChar;

		var content = "";

		// EOF
		if (curr == null)
			return makeToken(TokenTypes.EOF, this.linenr);

		// [
		else if (curr == '[')
			return makeToken(TokenTypes.OPENBRACKET, this.linenr);

		// ]
		else if (curr == ']')
			return makeToken(TokenTypes.CLOSEBRACKET, this.linenr);

		// {
		else if (curr == '{')
			return makeToken(TokenTypes.OPENBRACE, this.linenr);

		// }
		else if (curr == '}')
			return makeToken(TokenTypes.CLOSEBRACE, this.linenr);

		// comments
		if (curr == '#') {
			while (this.nextChar != '\n' && this.nextChar != null)
				this.readChar();

			return this._nextToken();
		}

		// whitespace
		if (isspace(curr)) {
			while (isspace(this.nextChar) && this.nextChar != null)
				this.readChar();

			return this._nextToken();
		}

		// string "
		else if (curr == '"') {
			var prev = curr;
			this.readChar();
			var ch;

			while (ch != '"') {
				ch = this.currChar;
				if (prev == '\\') {
					if (ch == '\\') {
						ch = '\0';
						content += '\\';
					} else if (ch == '"') {
						ch = '\0';
						content += '"';
					} else if (ch == 'b')
						ch = '\b';
					else if (ch == 'f')
						ch = '\f';
					else if (ch == 'n')
						ch = '\n';
					else if (ch == 'r')
						ch = '\r';
					else if (ch == 't')
						ch = '\t';
					else if (ch == 'u') {
						var hex = "";
						this.readChar();
						hex += this.currChar;
						this.readChar();
						hex += this.currChar;
						this.readChar();
						hex += this.currChar;
						this.readChar();
						hex += this.currChar;

						if (!/[0-9a-fA-F]{4}/.test(hex)) {
							var t = makeToken(TokenTypes.STRING, this.linenr, "", true);
							this.err(t, "Invalid escape sequence: \\u"+hex);
						}
						var num = parseInt(hex, 16);
						ch = String.fromCharCode(num);
					} else {
						var t = makeToken(TokenTypes.STRING, this.linenr, "", true);
						this.err(t, "Invalid escape sequence: \\"+ch);
					}
				} else if (ch == '"') {
					break;
				}

				if (ch != '\\' && ch != '\0')
					content += ch;

				prev = ch;
				this.readChar();
			}

			var t = makeToken(TokenTypes.STRING, this.linenr, "", true);
			content = expandEnv(this, t, content);
			t.content = content;
			return t;
		}

		// string '
		else if (curr == "'") {
			this.readChar();
			while (this.currChar != "'") {
				content += this.currChar;
				this.readChar();
			}

			return makeToken(TokenTypes.STRING, this.linenr, content, true);
		}

		// string without quotes, or bool
		else {
			content += this.currChar;
			var cont = () => (
				!isspace(this.nextChar) &&
				this.nextChar != '#' &&
				this.nextChar != '[' &&
				this.nextChar != ']' &&
				this.nextChar != '{' &&
				this.nextChar != '}');
			while (cont()) {
				content += this.nextChar;
				this.readChar();
			}

			var numRx = /^\-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

			if (content === "true")
				return makeToken(TokenTypes.BOOL, this.linenr, true);
			else if (content === "false")
				return makeToken(TokenTypes.BOOL, this.linenr, false);
			else if (content === "null")
				return makeToken(TokenTypes.NULL, this.linenr);
			else if (numRx.test(content))
				return makeToken(TokenTypes.NUMBER, this.linenr, content);
			else
				return makeToken(TokenTypes.STRING, this.linenr, content, false);
		}
	}

	errFormat(token) {
		return "line "+token.linenr;
	}

	warn(token, msg) {
		console.error(
			"Warning: "+this.errFormat(token)+": "+msg);
	}

	err(token, msg) {
		var err = new Error(
			this.errFormat(token)+": "+msg);
		err.hconfigParseError = true;
		throw err;
	}

	readToken() {
		this.currToken = this._nextToken();
	}

	expect(type) {
		var t = this.currToken;
		if (t.type !== type) {
			if (type === TokenTypes.EOF) {
				this.err(
					t,
					"Gibberish at the end of input: "+
					TokenTypes.str(t.type));
			} else {
				this.err(
					t,
					"Expected "+TokenTypes.str(type)+", got "+
					TokenTypes.str(t.type));
			}
		}

		this.readToken();
		return t;
	}
}

class FileTokenStream extends TokenStream {
	constructor(file) {
		super();
		this.file = file;
		this.fd = fs.openSync(file, "r");
		this.init();
	}

	errFormat(token) {
		return this.file+":"+token.linenr;
	}

	_nextChar() {
		var buf = Buffer.alloc(1);
		var cnt = fs.readSync(this.fd, buf, 0, 1);
		if (cnt === 0)
			return null;
		else
			return String.fromCharCode(buf[0]);
	}
}

class StringTokenStream extends TokenStream {
	constructor(str) {
		super();
		this.str = str;
		this.index = 0;
		this.init();
	}

	_nextChar() {
		if (this.str.length <= this.index)
			return null;
		else
			return this.str[this.index++];
	}
}

class Parser {
	constructor(stream, sections, data) {
		this.stream = stream;

		this.sections = sections;
		this.data = data || {};

		if (sections) {
			for (var i in sections) {
				var sec = sections[i];
				if (sec === "once") {
					sections[i] = { count: "once" };
				} else if (sec === "many") {
					sections[i] = { count: "many" };
				} else if (typeof sec !== "object") {
					throw new Error(
						"Invalid section specifier for "+i+": "+sec);
				}

				this.validateSectionSpecifier(i, sections[i]);
			}
		}
	}

	validateSectionSpecifier(name, sec) {
		function err(msg) {
			throw new Error(
				"Invalid section specifier for "+name+": "+msg);
		}

		// If props doesn't exist, just make one with a '*': "any"
		if (!sec.props)
			sec.props = { "*": "any" };

		// Make sure the property 'name' exists
		if (sec.props.name === undefined)
			sec.props.name = [ "string", "null" ];

		// Validate that the count is many or once
		if (sec.count !== "many" && sec.count !== "once")
			err("Expected count to be 'many' or 'once', got "+sec.count);

		// Validate that all types are sane
		var knownTypes = [ "string", "number", "array", "object", "bool", "null", "any" ];
		for (var i in sec.props) {

			// Allow people to specify single allowed types as strings
			// rather than arrays
			if (typeof sec.props[i] === "string")
				sec.props[i] = [sec.props[i]];

			var prop = sec.props[i];

			// Only known types should be specified
			for (var j in prop) {
				if (knownTypes.indexOf(prop[j]) === -1)
					err("Property "+i+": Unexpected type "+prop[j]);
			}

			// Doesn't make sense to specify type "any" in addition to others
			if (prop.length > 1 && prop.indexOf("any") !== -1)
				err("Property "+i+": Type 'any' must be specified alone");
		}
	}

	validatePropType(token, i, prop, types) {
		if (types == null) {
			this.stream.err(
				token,
				"Section "+token.content+": Unknown property '"+i+"'");
		}

		if (types.indexOf("any") !== -1)
			return;

		// Finding the type of a javascript object is slightly ugly
		var type = typeof prop;
		if (prop === null)
			type = "null";
		else if (prop instanceof Array)
			type = "array";
		else if (type === "boolean")
			type = "bool";

		// Error if invalid type
		if (types.indexOf(type) === -1) {
			var str = types.length === 1
				? types[0]
				: "one of ("+types.join(", ")+")";

			this.stream.err(
				token,
				"Section "+token.content+", property "+i+": "+
				"Expected "+str+", got "+type);
		}
	}

	// Validate section, then insert if it's valid
	insertSection(token, obj) {
		var name = token.content;

		if (this.sections == null) {
			if (!this.data[name])
				this.data[name] = [];
			this.data[name].push(obj);
			return;
		}

		var sec = this.sections[name];

		if (!sec)
			this.stream.err(token, "Unknown section: "+name);

		// Validate that count='once' sections only appear once
		if (sec.count === "once" && this.data[name])
			this.stream.err(
				token, "Expected section "+name+" to exist only once");

		// Validate types for properties, if props exists
		if (sec.props) {
			for (var i in obj) {
				var types = sec.props[i] || sec.props["*"];
				this.validatePropType(token, i, obj[i], types)
			}
		}

		// Insert
		if (sec.count === "once") {
			this.data[name] = obj;
		} else if (sec.count === "many") {
			if (!this.data[name])
				this.data[name] = [];
			this.data[name].push(obj);
		}
	}

	parseSections() {
		var stream = this.stream;

		while (stream.currToken.type !== TokenTypes.EOF) {
			if (
					(stream.currToken.type === TokenTypes.STRING) &&
					(stream.currToken.content === "include") &&
					(!stream.currToken.isQuoted))
				this.include();
			else
				this.parseSection();
		}
	}

	include() {
		var stream = this.stream;

		// 'include'
		stream.expect(TokenTypes.STRING);

		// <file>
		var file = stream.expect(TokenTypes.STRING);

		var path;
		if (pathlib.isAbsolute(file.content)) {
			path = file.content;
		} else {
			if (this.stream instanceof FileTokenStream) {
				var dirname = pathlib.dirname(this.stream.file);
				path = pathlib.join(dirname, file.content);

				if (pathlib.normalize(stream.file) === pathlib.normalize(path))
					stream.err(file, "Attempted to include self");
			} else {
				path = file.content;
			}
		}

		var stream;
		try {
			stream = new FileTokenStream(path);
		} catch (err) {
			stream.warn(file, err.toString());
		}

		var parser = new Parser(stream, this.sections, this.data);
		parser.parseSections();
	}

	parseSection() {
		var stream = this.stream;

		// <section>
		var section = stream.expect(TokenTypes.STRING);


		// [name property]
		var sub = undefined;
		if (stream.currToken.type !== TokenTypes.OPENBRACE)
			sub = this.parseValue();

		// <object>
		var obj = this.parseObject();

		if (sub !== undefined)
			obj.name = sub;
		else
			obj.name = null;

		// Insert and validate section
		this.insertSection(section, obj);
	}

	parseArray() {
		var stream = this.stream;

		// '['
		stream.expect(TokenTypes.OPENBRACKET);

		// values
		var arr = [];
		while (stream.currToken.type !== TokenTypes.CLOSEBRACKET) {
			arr.push(this.parseValue());
		}

		// ']'
		stream.expect(TokenTypes.CLOSEBRACKET);
		return arr;
	}

	parseObject(ignoreBraces) {
		var stream = this.stream;

		// '{'
		if (!ignoreBraces) {
			stream.expect(TokenTypes.OPENBRACE);
		}

		// [values]
		var obj = {};
		while (
				stream.currToken.type !== TokenTypes.CLOSEBRACE &&
				stream.currToken.type !== TokenTypes.EOF) {
			var key = stream.expect(TokenTypes.STRING);
			var val = this.parseValue();
			obj[key.content] = val;
		}

		// '}'
		if (!ignoreBraces)
			stream.expect(TokenTypes.CLOSEBRACE);
		return obj;
	}

	parseValue() {
		var stream = this.stream;

		if (stream.currToken.type === TokenTypes.BOOL)
			return stream.expect(TokenTypes.BOOL).content;
		if (stream.currToken.type === TokenTypes.NULL) {
			stream.expect(TokenTypes.NULL);
			return null;
		} if (stream.currToken.type === TokenTypes.STRING)
			return stream.expect(TokenTypes.STRING).content;
		if (stream.currToken.type === TokenTypes.NUMBER)
			return parseFloat(stream.expect(TokenTypes.NUMBER).content);
		if (stream.currToken.type === TokenTypes.OPENBRACKET)
			return this.parseArray();
		if (stream.currToken.type === TokenTypes.OPENBRACE)
			return this.parseObject();

		stream.err(
			stream.currToken,
			"Unexpected token "+TokenTypes.str(stream.currToken.type));
	}
}

function parseFile(file, includeRoot) {
	var stream = new FileTokenStream(file);
	var parser = new Parser(stream);
	var val;
	if (includeRoot)
		val = parser.parseValue();
	else
		val = parser.parseObject(true /* ignoreBraces */);
	stream.expect(TokenTypes.EOF);
	return val;
}

function parseString(str, includeRoot) {
	var stream = new StringTokenStream(str);
	var parser = new Parser(stream);
	var val;
	if (includeRoot)
		val = parser.parseValue();
	else
		val = parser.parseObject(true /* ignoreBraces */);
	stream.expect(TokenTypes.EOF);
	return val;
}

function parseConfFile(file, sections) {
	var stream = new FileTokenStream(file);
	var parser = new Parser(stream, sections);
	parser.parseSections();
	return parser.data;
}

function parseConfString(str, sections) {
	var stream = new StringTokenStream(str);
	var parser = new Parser(stream, sections);
	parser.parseSections();
	return parser.data;
}
