#!/bin/bash
community=$(cd -- "$(dirname "$0")" &> /dev/null && cd ../../.. && pwd)
tooling="$community/addons/web/tooling"
testRealPath="$(realpath --relative-to=. "$tooling/hooks")"
if [[ $testRealPath == "" ]]; then
    echo "Please install realpath"
    exit 1
fi

enableInDir () {
    cd "$1" || exit
    hooksPath="$(realpath --relative-to=. "$tooling/hooks")"
    git config core.hooksPath "$hooksPath"
    sed "s/preprocess\/me/$(echo "$tooling/eslint_rules/eslint_odoo_plugin" | sed 's/\//\\\//g')/g" "$tooling/_eslint.config.js" > eslint.config.js
    cp "$tooling/_jsconfig.json" jsconfig.json
    cp "$tooling/_package.json" package.json
    if [[ $2 == "copy" ]]; then
        # -i is not supported on mac
        sed "s@addons@$pathFromEnterpriseToCommunity/addons@g" jsconfig.json > tmp.json
        mv tmp.json jsconfig.json
        # copy over node_modules and package-lock to avoid double "npm install"
        cp "$community/package-lock.json" package-lock.json
        cp -a "$community/node_modules" node_modules
    else
        npm install
    fi
    cd - &> /dev/null
}

read -p "Do you want the tooling installed in enterprise too ? [y, n]" willingToInstallToolingInEnterprise
if [[ $willingToInstallToolingInEnterprise != "n" ]]
then
    read -p "What is the relative path from community to enterprise ? (../enterprise)" pathToEnterprise
    pathToEnterprise=${pathToEnterprise:-../enterprise}
    pathToEnterprise=$(realpath "$community/$pathToEnterprise")
    pathFromEnterpriseToCommunity=$(realpath --relative-to="$pathToEnterprise" "$community")
fi

enableInDir "$community"

if [[ $willingToInstallToolingInEnterprise != "n" ]]
then
    enableInDir "$pathToEnterprise" copy
fi

echo ""
echo "JS tooling have been added to the roots"
echo "Make sure to refresh the eslint and typescript service and configure your IDE so it uses the config files"
echo 'For VSCode, look inside your .vscode/settings.json file ("editor.defaultFormatter": "dbaeumer.vscode-eslint")'
echo ""
