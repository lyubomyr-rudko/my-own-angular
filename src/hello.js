function sayHello (name) {
	return _.template('Hello, <%= name %>!')({name: name});
}
