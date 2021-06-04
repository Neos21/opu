#!/usr/bin/env node

const fs   = require('fs').promises;
const path = require('path');
const childProcess = require('child_process');
const util = require('util');

const inquirer = require('inquirer');
const open = require('open');
const terminalLink = require('terminal-link');

/**
 * package.json を読み込む
 * 
 * @return {object} package.json を JSON.parse() したオブジェクト・処理に失敗した場合は空の連想配列
 */
const readPackageJson = async () => {
  const packageJsonPath = path.resolve(process.cwd(), './package.json');
  
  try {
    await fs.access(packageJsonPath);
  }
  catch(_error) {
    console.warn('\npackage.json not found');
    return {};
  }
  
  let rawPackageJson;
  try {
    rawPackageJson = await fs.readFile(packageJsonPath, 'utf-8');
  }
  catch(_error) {
    console.warn('\nCannot read package.json');
    return {};
  }
  
  try {
    const packageJson = JSON.parse(rawPackageJson);
    return packageJson;
  }
  catch(_error) {
    console.warn('\nFailed to parse package.json');
    return {};
  }
};

/**
 * package.json の内容から URL を取得する
 * 
 * @param {object} packageJson package.json をパースしたオブジェクト
 * @return {object} homepage, author, repository, bugs, funding をキー、それぞれのプロパティに対応する URL 文字列を値としたオブジェクト。URL が取得できなかった場合は null が格納されている
 */
const findUrlsFromPackageJson = packageJson => {
  /**
   * 指定のプロパティにある URL 文字列を取得する
   * 
   * @param {string} propertyName プロパティ名
   * @return {string} URL。取得できなかった場合は null
   */
  const getFromUrlProperty = propertyName => {
    const url = (typeof packageJson[propertyName] === 'string') ? packageJson[propertyName] : packageJson[propertyName]?.url;
    return !url ? null : url.replace((/(#.*|\.git$)/u), '');  // '#' 以降の文字列や末尾の '.git' を削る
  };
  
  const homepage = getFromUrlProperty('homepage');
  const author = (() => {
    const url = getFromUrlProperty('author');
    if(!url) return null;
    // 文字列中にカッコに囲まれた部分があればそれを URL とする
    const match = url.match((/\((http.*)\)/u));
    return match ? match[1] : url;
  })();
  const repository = (() => {
    const url = getFromUrlProperty('repository');
    if(!url) return null;
    // 'git+' から始まっていればそれを削除して渡す
    return url.replace((/^git\+/u), '');
  })();
  const bugs = getFromUrlProperty('bugs');
  const funding = getFromUrlProperty('funding');
  return { homepage, author, repository, bugs, funding };
};

/**
 * Git リモート URL を取得する
 * 
 * @return {string | null} Git リモート URL が見つかればその URL 文字列、見つからなければ null を返す
 */
const findUrlFromGitConfig = async () => {
  try {
    const result = await util.promisify(childProcess.exec)('git config remote.origin.url');
    const url = result.stdout.split('\n').find(line => line.trim());  // 確実に URL を1つだけ取得する
    if(!url) return null;
    return url.replace((/\/\/.*@/u), '//').replace((/(\.git$)/u), '');  // '//user-name@' は '//' のみに削り、末尾の '.git' を削る
  }
  catch(_error) {
    return null;  // 異常時 (Git リポジトリではない・git コマンドが存在しないなど) は何もしない
  }
};

/**
 * package.json から取得した URL を利用し、GitHub 関連の URL を生成する
 * 
 * @param {object} urls package.json から取得した URL のオブジェクト。プロパティ名がキー、URL が値の構成
 * @return {object} GitHub 関連の URL を格納したオブジェクト。うまく生成できなかった場合は null が格納される
 */
const detectGitHubUrls = urls => {
  let userName       = null;
  let repositoryName = null;
  let hasGitHubPages = false;  // GitHub Pages が存在することが確実な場合は true にする
  let gitHubPagesUrl = null;
  
  Object.values(urls).forEach(url => {
    if(!url) return;
    if(url.includes('github.com')) {
      if(!userName) {
        const matchUserName = url.match((/github\.com\/(.*?)(\/|\?|#|$)/u));
        if(matchUserName && matchUserName[1] !== '') userName = matchUserName[1];
      }
      if(!repositoryName) {
        const matchRepositoryName = url.match((/github\.com\/(.*?)\/(.*?)(\/|\?|#|$)/u));
        if(matchRepositoryName && matchRepositoryName[2] !== '') repositoryName = matchRepositoryName[2];
      }
    }
    else if(url.includes('github.io') && !gitHubPagesUrl) {
      hasGitHubPages = true;  // GitHub Pages が存在することが確実
      
      const gitHubPagesUrlMatch = url.match((/:\/\/(.+?)\.github\.io(\/.*?)?(\/|\?|#|$)/u));  // FIXME : Repository Name 部分の判定が不十分 ('/?hoge' などに対応しきれていない)
      if(!gitHubPagesUrlMatch) return;
      
      if(gitHubPagesUrlMatch[1]) {
        gitHubPagesUrl = `https://${gitHubPagesUrlMatch[1]}.github.io`;
        if(!userName) userName = gitHubPagesUrlMatch[1];
      }
      
      if(gitHubPagesUrlMatch[2] && gitHubPagesUrlMatch[2].length > 1) {
        // '/' 以上の文字列が取れていれば Repository Site とみなす
        gitHubPagesUrl += gitHubPagesUrlMatch[2];
        
        // '/index.html' など User Site のファイルがマッチしている可能性もあるので、ピリオドが含まれていなければリポジトリ名として採用する
        // FIXME : リポジトリ名にピリオドを含めることはできるのでこの判定は不正確
        if(!repositoryName) {
          const path = gitHubPagesUrlMatch[2].replace((/^\//u), '');
          if(!path.includes('.')) repositoryName = path;
        }
      }
      else if(gitHubPagesUrlMatch[2] == null || gitHubPagesUrlMatch[2].length === 1) {
        // '/' までしか取れていなければ User Site 確定とする
        if(!repositoryName) repositoryName = `${gitHubPagesUrlMatch[1]}.github.io`;
      }
    }
  });
  
  const gitHubUserUrl       = userName                   ? `https://github.com/${userName}`                   : null;
  const gitHubRepositoryUrl = userName && repositoryName ? `https://github.com/${userName}/${repositoryName}` : null;
  if(!gitHubPagesUrl && userName) {
    gitHubPagesUrl = `https://${userName}.github.io`;
    if(repositoryName) gitHubPagesUrl += `/${repositoryName}`;
  }
  
  return { userName, repositoryName, gitHubUserUrl, gitHubRepositoryUrl, hasGitHubPages, gitHubPagesUrl };
};

/**
 * inquirer.js に渡す選択肢となる配列を作成する
 * 
 * @param {object} urls package.json から取得した URL のオブジェクト
 * @param {object} gitHubUrls GitHub 関連の URL のオブジェクト
 * @return {Array<object>} 選択肢名を name、URL を value に持つオブジェクトの配列
 */
const makeChoices = (urls, gitHubUrls) => {
  const choices = [];
  
  if(gitHubUrls.gitHubRepositoryUrl) {
    choices.push({
      name: `[${choices.length + 1}]  ${gitHubUrls.gitHubRepositoryUrl} ... GitHub Repository Page (${gitHubUrls.userName}/${gitHubUrls.repositoryName})`,
      value: gitHubUrls.gitHubRepositoryUrl
    });
  }
  if(gitHubUrls.gitHubUserUrl) {
    choices.push({
      name: `[${choices.length + 1}]  ${gitHubUrls.gitHubUserUrl} ... GitHub User Page (${gitHubUrls.userName})`,
      value: gitHubUrls.gitHubUserUrl
    });
  }
  if(gitHubUrls.gitHubPagesUrl) {
    choices.push({
      name: `[${choices.length + 1}]  ${gitHubUrls.gitHubPagesUrl} ... GitHub Pages${gitHubUrls.hasGitHubPages ? '' : ' (Maybe Not Found)'}`,
      value: gitHubUrls.gitHubPagesUrl
    });
  }
  
  Object.keys(urls).forEach(key => {
    const url = urls[key];
    if(!url) return;
    if(key === 'gitRemoteUrl') {
      return choices.push({
        name: `[${choices.length + 1}]  ${url} ... Git Remote URL`,
        value: url
      });
    }
    choices.push({
      name: `[${choices.length + 1}]  ${url} ... package.json ${key}`,
      value: url
    });
  });
  
  // 選択肢が1つ以上ある場合にキャンセル選択肢を用意する
  if(choices.length > 0) {
    choices.push({
      name: `[${choices.length + 1}]  Cancel`,
      value: false
    });
  }
  
  return choices;
};

/**
 * 選択肢の配列を利用し、ターミナルリンクを表示する
 * 
 * @param {Array<object>} choices inquirer.js に渡す想定の選択肢の配列
 */
const showLinks = choices => {
  choices.forEach(choice => {
    if(!choice.value) return;  // Cancel は除く
    console.log(terminalLink(choice.name, choice.value, { fallback: false }));  // choice.name 内に URL 文字列が記載されているので Fallback は無効にする
  });
}

(async () => {
  try {
    // package.json を読み取り URL を取得・生成する
    const packageJson = await readPackageJson();
    const urls = findUrlsFromPackageJson(packageJson);
    
    // Git リポジトリのリモート URL があれば取得・マージする
    const gitRemoteUrl = await findUrlFromGitConfig();
    if(gitRemoteUrl) urls.gitRemoteUrl = gitRemoteUrl;
    
    // URL 一覧から GitHub 関連の URL を組み立てる
    const gitHubUrls = detectGitHubUrls(urls);
    
    // 選択肢を用意する : 選択肢が1つもない = URL が1つも抽出できなかった場合なので中断する
    const choices = makeChoices(urls, gitHubUrls);
    if(!choices.length) return console.error('\nNo URLs detected');
    
    // 選択肢を表示する
    console.log('');  // 空行
    const answer = await inquirer.prompt({
      type: 'list',
      name: 'url',  // answer.url = 'value'
      message: 'Which URL do you want to open?',
      choices: choices,
      loop: false
    });
    
    // 選択肢と同様のターミナルリンクを表示する
    showLinks(choices);
    // Cancel 以外が選択された場合は URL をブラウザで開く
    if(answer.url) await open(answer.url);
  }
  catch(_error) {
    // エラー時は何もしない
  }
})();
