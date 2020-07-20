#!/usr/bin/env node

const fs   = require('fs').promises;
const path = require('path');

const readPackageJson = async () => {
  const packageJsonPath = path.resolve(process.cwd(), './package.json');
  
  try {
    await fs.access(packageJsonPath);
  }
  catch(error) {
    console.error('package.json not found');
    throw error;
  }
  
  let rawPackageJson;
  try {
    rawPackageJson = await fs.readFile(packageJsonPath, 'utf-8');
  }
  catch(error) {
    console.error('Cannot read package.json');
    throw error;
  }
  
  try {
    const packageJson = JSON.parse(rawPackageJson);
    return packageJson;
  }
  catch(error) {
    console.error('Failed to parse package.json');
    throw error;
  }
};

const findUrls = (packageJson) => {
  const getFromUrlProperty = (propertyName) => {
    return (packageJson[propertyName] && packageJson[propertyName].url) ? packageJson[propertyName].url : null;
  };
  
  const homepage = packageJson.homepage || null;
  const author = (() => {
    const url = getFromUrlProperty('author');
    if(url) { return url; }
    if(typeof packageJson.author === 'string') {
      const authorUrlMatch = packageJson.author.match((/\((.*)\)/u));
      if(authorUrlMatch) { return authorUrlMatch[1]; }
    }
    return null;
  })();
  const repository = (() => {
    const url = getFromUrlProperty('repository');
    if(url) { return url.startsWith('git+http') ? url.replace((/^git\+/u), '') : url; }
    return null;
  })();
  const bugs = getFromUrlProperty('bugs');
  const funding = getFromUrlProperty('funding');
  
  return { homepage, author, repository, bugs, funding };
};

const detectGitHubUrls = (urls) => {
  Object.keys(urls).forEach((key) => {
    const url = urls[key];
    if(!url) { return; }
    
    // TODO
  })
  
  const gitHubRepositoryUrl = foundGitHubUrl
    .replace((/(#readme|\.git|\/issues)$/u), '')
    .replace((/^https?:\/\/.*github\.com\/(.*)\/(.*)$/u), 'https://github.com/$1/$2');
  return gitHubRepositoryUrl;
};


(async () => {
  try {
    const packageJson = await readPackageJson();
    const urls = findUrls(packageJson);
    const gitHubRepositoryUrl = detectGitHubRepositoryUrl(urls);
    console.log(gitHubRepositoryUrl);
    
//    if(inputUrl.match(/^github\.com/u)) {
//      // Repository : GitHub Pages
//      resultUrl = `${inputUrl}/`.replace((/^github\.com\/(.*?)\//u), '$1.github.io/')
//                                .replace((/^(.*?)\.github\.io\/(.*?)\/.*/u), '$1.github.io/$2')
//                                .replace((/\/(.*?)\.github\.io$/u), '');
//    }
//    else if(inputUrl.match(/^(.*?)\.github\.io/u)) {
//      // GitHub Pages : Repository
//      resultUrl = inputUrl.replace((/^(.*)\.github\.io/u), 'github.com/$1')
//                          .replace((/^github\.com\/(.*?)\/(.*?)\/.*/u), 'github.com/$1/$2')
//                          .replace((/^github\.com\/(.*?)\/(.*?)\.(html|css|js)$/u), 'github.com/$1')
//    }
  }
  catch(error) {
    console.log('Error : ', error);
  }
})();
