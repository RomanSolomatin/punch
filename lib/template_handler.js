var _ = require("underscore");
var path = require("path");
var fs = require("fs");

module.exports = {

	templateDir: null,

	// get the template matching the exact path
	getTemplate: function(template_path, callback){
		var self = this;

		fs.stat(path.join(self.templateDir, template_path), function(err, stat){
			if(err){
				return callback(err, null);	
			}	

			if(!stat.isFile()){
				return callback("given path is not a file", null);	
			}
			
			return callback(null, {"full_path": template_path, "last_modified": stat.mtime });		
		});		
	},

  // get all templates fuzzly matches the path
	getTemplates: function(basepath, callback){
		var self = this;

		var filter_dir = function(dirpath, filter, last_attempt){
			fs.readdir(path.join(self.templateDir, dirpath), function(err, files){
				if(!err){

					var templates = [];

					//exclude dot files
					var template_files = files.filter(function(file){ return file[0] !== "." });

					_.each(template_files, function(file){

						var filename = file.split(".")[0];

						if(filter === "" || filename === filter){
							var full_path = path.join(dirpath, file);	
							var stat = fs.statSync(full_path);
						
							templates.push({"full_path": full_path, "last_modified": stat.mtime });
						}
					});

					return callback(null, templates);
				} else if(!last_attempt){
					var new_dirpath = path.dirname(dirpath);
					var new_filter = path.basename(dirpath).split(".")[0];

					return filter_dir(new_dirpath, new_filter, true); 	
				}	else {
					return callback(err, null);	
				}
			});
		};
		return filter_dir(basepath, "");
	},

	// reads and outputs the template matching the exact path
	readTemplate: function(template_path, callback){
		var self = this;

		fs.readFile(path.join(self.templateDir, template_path), "binary", function(err, template_output){
			if(err){
				return callback(err, null);	
			}

			return callback(null, template_output.toString());	
		});	
	},

 // read the best template fuzzly matches the path
	negotiateTemplate: function(basepath, extension, options, callback){
		var self = this;

		var read_template_or_layout = function(file_path){
			fs.stat(file_path, function(err, stat){
				if(err){
					// read the layout file
					var base_path = path.basename(file_path);
					var dir_path = path.dirname(file_path);

					if(base_path.indexOf("_layout") > -1){
						var dir_path = path.join(dir_path, "..");
					}

					if(dir_path.indexOf(self.templateDir) > -1){
						var layout_file_path = path.join(dir_path, ("_layout" + extension));
						return read_template_or_layout(layout_file_path);
					} else {
						return callback(err, null, null);	
					}
				}

				fs.readFile(file_path, function(err, template_output){
					if(err){
						return callback(err, null, stat.mtime);	
					}

					return callback(null, template_output.toString(), stat.mtime);	
				});
			});
		}
		
		var template_file_path = path.join(self.templateDir, (basepath + extension));

		return read_template_or_layout(template_file_path);	
	},

	// get all partials matching the given path
	getPartials: function(basepath, extension, options, callback){

		var self = this;

		var last_modified = null;
		var collected_partials = {};

		var read_partial = function(partial_path, partial_complete){
			fs.stat(partial_path, function(err, stat){
				if(err){
					return partial_complete();
				}

				fs.readFile(partial_path, function(err, partial_output){
					if(err){
						return partial_complete();
					}

					// if the given partial has been updated,
					// change the last modified of the collection
					if(stat.mtime > last_modified){
						last_modified	= stat.mtime;
					} 

					var partial_name = path.basename(partial_path, extension).substring(1);
					collected_partials[partial_name] = partial_output.toString(); 

					return partial_complete();
				});
			});
		};

		var traverse_dir = function(dir, dir_complete){
			var dirpath = path.join(self.templateDir, dir);

			fs.readdir(dirpath, function(err, files){
				if(err){
					return dir_complete();
				}
			
        var partials = files.filter(function(file){ return (file[0] === "_" && file.indexOf(extension) > -1) });

				var read_partial_callback = function(){
					if(partials.length){
						return read_partial(path.join(dirpath, partials.pop()), read_partial_callback);
					} else {
						return dir_complete();	
					}	
				};
				read_partial_callback();

			});	
		};

		var directories_to_look = [];
		_.each(basepath.split("/"), function(current_dir_entry){
			var previous_dir_entry = directories_to_look[directories_to_look.length - 1];
			directories_to_look.push(path.join(previous_dir_entry, current_dir_entry));
		});

		var traverse_dir_callback = function(){
			if(directories_to_look.length){
				return traverse_dir(directories_to_look.shift(), traverse_dir_callback);		
			}	else {
				return callback(null, collected_partials, last_modified);	
			}
		};
		traverse_dir_callback();

	}

}