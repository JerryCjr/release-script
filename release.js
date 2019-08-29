const minimist = require("minimist");
const git = require("simple-git/promise");
// get working directory
const args = minimist(process.argv.slice(2), {
  alias: {
    d: "directory"
  }
});
//console.log('working directory:', args.d);
// read projects
const fs = require("fs");
const { join } = require("path");

if (!fs.existsSync(args.d)) {
  console.log("working directory:[", args.d, "] does not exist!");
  process.exit(1);
}
// we only need subdirectories with git
const getDirectories = source =>
  fs
    .readdirSync(source, {
      withFileTypes: true
    })
    .filter(
      dirent =>
        dirent.isDirectory() && fs.existsSync(join(source, dirent.name, ".git"))
    )
    .map(dirent => dirent.name);

let projects = getDirectories(args.d);
// prompt projects we would like to release
var inquirer = require("inquirer");
// the project with -wxapp is miniprogram
var finalChoices = [];
finalChoices.push(new inquirer.Separator(" = Mini Programs = "));
finalChoices.push(...projects.filter(project => project.endsWith("-wxapp")));
finalChoices.push(new inquirer.Separator(" = Others = "));
finalChoices.push(...projects.filter(project => !project.endsWith("-wxapp")));

// 主函数
async function main() {
  let r = await inquirer.prompt([
    {
      type: "checkbox",
      message: "Select projects to release",
      name: "projects",
      choices: finalChoices,
      validate: function(answer) {
        if (answer.length < 1) {
          return "You must choose at least one project.";
        }
        return true;
      }
    },
    {
      type: "input",
      name: "tag",
      message: "What's the tag for this release",
      default: function() {
        var today = new Date();
        var tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        var dateFormat = require("dateformat");
        return dateFormat(tomorrow, "yyyymmdd");
      }
    }
  ]);
  const { projects, tag } = { ...r };

  let checkingPromises = projects.map(async project => {
    // Ensure working directory is clean
    console.log("");
    console.log("====", project, "====");
    console.log("");

    const pgit = git(join(args.d, project));
    let r = await pgit.status();
    if (r.files.length > 0) return Promise.resolve(project);
  });

  const checkingResult = await Promise.all(checkingPromises);
  const dirtyArray = checkingResult.filter(item => item);

  if (dirtyArray && dirtyArray.length) {
    console.log("Working directory is not clean!");
    console.log("dirtyArry is:", dirtyArray);
    process.exit(1);
  } else {
    // let's release one by one
    for (const project of projects) {
      const pgit = git(join(args.d, project));
      // Get current branch and checkout if needed
      console.log("Checking out vNext ...");
      await pgit.checkout("vNext");
      await pgit.pull("origin", "vNext");
      // Checkout master branch and merge version branch into master
      console.log("Checking out master_nonono ...");
      await pgit.checkout("master_nonono");
      await pgit.pull("origin", "master_nonono");
      console.log("Merging vNext to master_nonono ...");
      await pgit.merge(["vNext", "--no-ff", "--no-edit"]);
      console.log("Tagging", tag, "...");
      await pgit.addTag(tag);
      // if it's a miniprogram, read conf.json to tag version
      const confPath = join(args.d, project, "conf.json");
      if (!project.endsWith("-wxapp") || !fs.existsSync(confPath)) {
        return;
      }
      let conf = require(confPath);
      console.log("Tagging", conf.version, "...");
      await pgit.addTag(conf.version);
      console.log("Pushing to remote ...");
      await pgit.push("origin", "master_nonono");
      await pgit.pushTags("origin");
      console.log("Done 🎉");
    }
  }
}

main();
