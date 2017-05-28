# HConfig

Better config files with node.js.

<!-- toc -->

- [Usage](#usage)
- [UNIX style config files](#unix-style-config-files)
- [API](#api)
  * [hconfig.parseFile(filename, includeRoot)](#hconfigparsefilefilename-includeroot)
  * [hconfig.parseString(string, includeRoot)](#hconfigparsestringstring-includeroot)
  * [hconfig.parseConfFile(file, sections)](#hconfigparseconffilefile-sections)
  * [hconfig.parseConfString(string, sections)](#hconfigparseconfstringstring-sections)
- [Error handling](#error-handling)
- [Syntax](#syntax)
  * [Strings](#strings)
  * [Numbers](#numbers)
  * [Booleans and null](#booleans-and-null)
  * [Objects](#objects)
  * [Arrays](#arrays)
  * [Sections](#sections)
  * [Include](#include)
  * [Comments](#comments)

<!-- tocstop -->

HConfig is a configuration file parser with JSON-like syntax but without all the
cruft. It's not intended to be used for communication between computers, but
rather to be written by humans.

Here's an example config file for an imaginary web server:

`conf.hcnf:`
```
general {
	port 8080
	host localhost
	index [ .html .htm ]
}

# This is where I host my cat pictures
virtual-host cats.example.com {
	webroot /var/www/mycats
}

# Srs bsns
virtual-host resume.example.com {
	webroot /var/www/resume
}
```

Parse it with this line:

``` javascript
hconfig.parseConfFile("conf.hcnf",
	{ general: "once", "virtual-host": true });
```

and it returns this object:

``` json
{
	"general": {
		"port": 8080,
		"host": "localhost",
		"index": [ ".html", ".htm" ]
	},
	"virtual-host": [
		{ "name": "cats.example.com", "webroot": "/var/www/mycats" },
		{ "name": "resume.example.com", "webroot": "/var/www/resume" }
	]
}
```

`general` is an object, becasue we specified that it only exists once.
`virtual-host` is an array, because we only specified that it existst.

## Usage

Install:

```
npm install hconfig
```

Use:

```
var hconfig = require("hconfig");

hconfig.parseFile(filename);
// or
hconfig.parseString(string);
// or
hconfig.parseConfFile(filename);
// or
hconfig.parseConfString(strinf);
```

To run tests (requires mocha):

```
npm test
```

## UNIX style config files

There are many JSON-like configuration formats with a prettier syntax out
there, however those aren't really suitable for a lot of configuration files.
Most config files for UNIX-style tools (e.g rc files, web servers, text
editors) let you include other files, which is incredibly important in many
situations, and neither JSON nor the JSON replacements out there are really
built with that in mind.

With hconfig, you can create two files, say foo.hcnf and bar.hcnf, like this:

`foo.hcnf:`
```
virtual-host http://cats.example.com {
	webroot /var/www/mycats
}

virtual-host http://resume.example.com {
	webroot /var/www/resume
}

include bar.hcnf
```

`bar.hcnf:`
```
virtual-host https://webmail.example.com {
	webroot  /var/www/webmail
	ssl-cert /etc/ssl/example.com.pem
	ssl-key  /etc/ssl/example.com.key
}
```

If our imaginary web server runs `hcnf.parseConfFile("foo.hcnf")`, it will get
a data structure which looks like this:

``` json
{
	"virtual-host": [
		{
			"name": "http://cats.example.com",
			"webroot": "/var/www/mycats"
		}, {
			"name": "http://resume.example.com",
			"webroot": "/var/www/resume"
		}, {
			"name": "https://webmail.example.com",
			"webroot": "/var/www/webmail",
			"ssl-cert": "/etc/ssl/example.com.pem",
			"ssl-key": "/etc/ssl/example.co.key"
		}
	]
}
```

As you can imagine, this is very useful for a lot of general configuration
stuff; there's a reason almost every traditional Linux and UNIX program has a
feature for including other configuration files.

## API

### hconfig.parseFile(filename, includeRoot)

Parse a file, in the simple JSON.parse-style way.

By default, it will parse the file as if it was inside an object literal, but
without braces, and return an object. However, if **includeRoot** is set to
true, it will parse any value; `{foo 10}` will be the object `{foo: 10}`, but
`"hello world"` will be a string, etc.

### hconfig.parseString(string, includeRoot)

Like parseFile, but with a string instead of a file.

### hconfig.parseConfFile(file, sections)

Parse a file in the mode detailed under the "UNIX style config files" heading.

If the sections parameter is an object, they will act as a whitelist,
and an error will be thrown if the config file contains sections not in the
object. This will throw an error, for example:

```
hconfig.parseConfFile("foo.hcnf", { "virtual-host": true });
```

`foo.hcnf:`
```
virtual-hots example.com { webroot /var/www }
```

You can also specify that a section should only exist once. This will thus
throw an error:

```
hconfig.parseConfFile("foo.hcnf", { "general": "once" });
```

`foo.hcnf:`
```
general { 
	port 8080
}

general {
	port 8081
}
```

### hconfig.parseConfString(string, sections)

Like parseConfFile, but with a string instead of a file.

## Error handling

If the parser encounters a problem with the file it's parsing, it will
throw an instance of the Error object. To differentiate parse errors from bugs
in HConfig, a `hconfigParseError` property is set to `true`. I would suggest
handling errors something like this:

```
let data;
try {
	data = hconfig.parseFile("conf.hcnf");
} catch (err) {
	if (err.hconfigParseError) {
		console.error(err.message);
		process.exit(1);
	} else {
		throw err;
	}
}
```

## Syntax

HConfig contains the basic javascript data types; strings, numbers, objects,
arrays, booleans, and null. In addition, it has the concept of sections,
though those only exist when using parseConfFile and parseConfString.

### Strings

* A quoted string starts with a `"`, and continues until the next `"`.
* An unquoted string is a sequence of any characters other than whitespace,
  `]`, and `}`, which doesn't match any other syntax.

### Numbers

* Like javascript's numbers. Allows exponents with `e` and `E`.

### Booleans and null

* `true` is the boolean true, `false` is the boolean false, and `null` is null.

### Objects

* An object starts with a `{`, followed by any number of key/value pairs, and
  is terminated with `}`.
* A key value pair is a string followed by a value. There is no separator
  between pairs, nor symbol between the key and value, other than whitespace.

`{ port 8080 host example.com }` => `{ port: 8080, host: "example.com" }`

### Arrays

* An array starts with a `[`, followed by any number of values, and is
  terminated with `]`.
* Like with objects, there is no separator between values.

`[ 10 20 50 ]` => `[10, 20 50]`

### Sections

* A "section" only exists when parsed with parseConfFile or parseConfString.
* The root of the file is a whitespace separated list of sections.
* They start with a mandatory string (the section name), followed by an
  optional string (the name property), followed by an object.

```
virtual-host example.com { foo 10 }
virtual-host blog.example.com { foo 15 }
```

becomes:

``` json
{
	"virtual-host": [
		{ "name": "example.com", "foo": 10 },
		{ "name": "blog.example.com", "foo": 15 }
	]
}
```

### Include

* An include is the string `include`, followed by another string, in the root
  of the file.
* It's only valid when parsed with parseConfFile or parseConfString.
* Includes the file at the specified path, relative to the current file (or the
  cwd if parseConfString is used).

### Comments

* Comments start with a #.
* Everything from # to the end of the line is a comment, and thus ignored.
