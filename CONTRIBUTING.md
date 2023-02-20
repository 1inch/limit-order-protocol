Contributing to 1inch
=======

Thanks for taking the time to contribute! All types of contributions are encouraged and valued. Please make sure to read the sections below before making your contribution. It will make it a lot easier for maintainers and speeds up the merge of your contribution.

## Creating Pull Requests (PRs)

As a contributor, you are expected to fork this repository, work on your own fork and then submit pull requests. The pull requests will be reviewed and eventually merged into the main repo.

## A typical workflow

1) Before contributing any changes it is a good practice to open an issue and provide the reasoning for the changes   
1) Make sure your fork is up to date with the main repository
2) Update all dependencies to the latest version
	```
	yarn
	``` 
3) Branch out from `master` into `fix/some-bug-#123`
(Postfixing #123 will associate your PR with the issue #123)
4) Make your changes, add your files, commit and push to your fork.
Before pushing the branch ensure that:
	* JS and Solidity linting tests pass
	```
	yarn lint
	```
	* New and/or fixed features are covered with relevant tests and all existing tests pass
	```
	yarn test
	```
5) Go to the GitHub repo in your web browser and issue a new pull request.
6) Maintainers will review your code and possibly ask for changes before your code is pulled into the main repository. We'll check that all tests pass, review the coding style, and check for general code correctness. If everything is OK, we'll merge your pull request.

## All done!

If you have any questions feel free to post them in the issues section.
Thanks for your time and code!
