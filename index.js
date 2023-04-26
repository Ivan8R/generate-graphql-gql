#!/usr/bin/env node

/**
 * generato-graphql-gql
 * cli generate graphql and qgl
 *
 * @author Ivan8R <->
 */

import meow from "meow";
import { getHeadersFromInput, getRemoteSchema, printToFile } from "./lib.js";
import { Source, buildSchema } from "graphql/index.js";
import fs from "fs";
import path from "path";
import del from "del";
import chalk from "chalk";

const cli = meow(
  `
	Usage
	  $ agql <input>

	Options
	   -u  Please ente url for parse graphql schema
         -f  Please ente folder for output

`,
  {
    importMeta: import.meta,
    flags: {
      url: {
        type: "string",
        alias: "u",
        isRequired: true,
      },
      folderDestination: {
        type: "string",
        alias: "f",
        isRequired: true,
      },
      header: {
        type: "string",
        alias: "h",
      },
      json: {
        type: "boolean",
        alias: "j",
        default: false,
      },
      method: {
        type: "string",
        alias: "m",
        default: "POST",
      },
      fileExtension: {
        type: "string",
        alias: "e",
        default: "js",
      },
    },
  }
);

if (process.env.NODE_ENV !== "test") main(cli);

/**
 * Main
 */
export async function main(cli) {
  /* Headers */
  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const headers = getHeadersFromInput(cli).reduce(
    (acc, { key, value }) => ({ ...acc, [key]: value }),
    defaultHeaders
  );

  /* Fetch schema */
  const schema = await getRemoteSchema(cli.flags["url"], {
    method: cli.flags.method,
    headers,
    json: cli.flags.json,
  });

  if (schema.status === "err") {
    console.warn(chalk.red(schema.message));
    return;
  }

  if (cli.flags.folderDestination !== undefined) {
    const result = printToFile(cli.flags["folderDestination"], schema.schema);
    console.log(chalk.green(result.status));
  } else {
    console.log(chalk.red(result.message));
    console.log(schema.schema);
  }

  /**
   * Make gql
   */
  let fileExtension = cli.flags["fileExtension"];
  let includeDeprecatedFields = false;
  let includeCrossReferences = false;
  let depthLimit = 100;
  let assume = false;
  let assumeValid = false;
  if (assumeValid === "true") {
    assume = true;
  }

  let schemaPath = path.join(
    path.resolve(process.cwd(), cli.flags["folderDestination"]),
    `shema.graphql`
  );

  const destDirPath = path.resolve(
    path.resolve(process.cwd(), cli.flags["folderDestination"]),
    "gqls"
  );

  const typeDef = fs.readFileSync(schemaPath, "utf-8");
  const source = new Source(typeDef);
  const gqlSchema = buildSchema(source, { assumeValidSDL: assume });

  del.sync(destDirPath);
  path
    .resolve(destDirPath)
    .split(path.sep)
    .reduce((before, cur) => {
      const pathTmp = path.join(before, cur + path.sep);
      if (!fs.existsSync(pathTmp)) {
        fs.mkdirSync(pathTmp);
      }
      return path.join(before, cur + path.sep);
    }, "");
  let indexJsExportAll = "";

  /**
   * Compile arguments dictionary for a field
   * @param field current field object
   * @param duplicateArgCounts map for deduping argument name collisions
   * @param allArgsDict dictionary of all arguments
   */
  const getFieldArgsDict = (field, duplicateArgCounts, allArgsDict = {}) =>
    field.args.reduce((o, arg) => {
      if (arg.name in duplicateArgCounts) {
        const index = duplicateArgCounts[arg.name] + 1;
        duplicateArgCounts[arg.name] = index;
        o[`${arg.name}${index}`] = arg;
      } else if (allArgsDict[arg.name]) {
        duplicateArgCounts[arg.name] = 1;
        o[`${arg.name}1`] = arg;
      } else {
        o[arg.name] = arg;
      }
      return o;
    }, {});

  /**
   * Generate variables string
   * @param dict dictionary of arguments
   */
  const getArgsToVarsStr = (dict) =>
    Object.entries(dict)
      .map(([varName, arg]) => `${arg.name}: $${varName}`)
      .join(", ");

  /**
   * Generate types string
   * @param dict dictionary of arguments
   */
  const getVarsToTypesStr = (dict) =>
    Object.entries(dict)
      .map(([varName, arg]) => `$${varName}: ${arg.type}`)
      .join(", ");

  /**
   * Generate the query for the specified field
   * @param curName name of the current field
   * @param curParentType parent type of the current field
   * @param curParentName parent name of the current field
   * @param argumentsDict dictionary of arguments from all fields
   * @param duplicateArgCounts map for deduping argument name collisions
   * @param crossReferenceKeyList list of the cross reference
   * @param curDepth current depth of field
   * @param fromUnion adds additional depth for unions to avoid empty child
   */
  const generateQuery = (
    curName,
    curParentType,
    curParentName,
    argumentsDict = {},
    duplicateArgCounts = {},
    crossReferenceKeyList = [], // [`${curParentName}To${curName}Key`]
    curDepth = 1,
    fromUnion = false
  ) => {
    const field = gqlSchema.getType(curParentType).getFields()[curName];
    const curTypeName = field.type.toJSON().replace(/[[\]!]/g, "");
    const curType = gqlSchema.getType(curTypeName);
    let queryStr = "";
    let childQuery = "";

    if (curType.getFields) {
      const crossReferenceKey = `${curParentName}To${curName}Key`;
      if (
        (!includeCrossReferences &&
          crossReferenceKeyList.indexOf(crossReferenceKey) !== -1) ||
        (fromUnion ? curDepth - 2 : curDepth) > depthLimit
      ) {
        return "";
      }
      if (!fromUnion) {
        crossReferenceKeyList.push(crossReferenceKey);
      }
      const childKeys = Object.keys(curType.getFields());
      childQuery = childKeys
        .filter((fieldName) => {
          /* Exclude deprecated fields */
          const fieldSchema = gqlSchema.getType(curType).getFields()[fieldName];
          return includeDeprecatedFields || !fieldSchema.deprecationReason;
        })
        .map(
          (cur) =>
            generateQuery(
              cur,
              curType,
              curName,
              argumentsDict,
              duplicateArgCounts,
              crossReferenceKeyList,
              curDepth + 1,
              fromUnion
            ).queryStr
        )
        .filter((cur) => Boolean(cur))
        .join("\n");
    }

    if (!(curType.getFields && !childQuery)) {
      queryStr = `${"    ".repeat(curDepth)}${field.name}`;
      if (field.args.length > 0) {
        const dict = getFieldArgsDict(field, duplicateArgCounts, argumentsDict);
        Object.assign(argumentsDict, dict);
        queryStr += `(${getArgsToVarsStr(dict)})`;
      }
      if (childQuery) {
        queryStr += `{\n${childQuery}\n${"    ".repeat(curDepth)}}`;
      }
    }

    /* Union types */
    if (curType.astNode && curType.astNode.kind === "UnionTypeDefinition") {
      const types = curType.getTypes();
      if (types && types.length) {
        const indent = `${"    ".repeat(curDepth)}`;
        const fragIndent = `${"    ".repeat(curDepth + 1)}`;
        queryStr += "{\n";
        queryStr += `${fragIndent}__typename\n`;

        for (let i = 0, len = types.length; i < len; i++) {
          const valueTypeName = types[i];
          const valueType = gqlSchema.getType(valueTypeName);
          const unionChildQuery = Object.keys(valueType.getFields())
            .map(
              (cur) =>
                generateQuery(
                  cur,
                  valueType,
                  curName,
                  argumentsDict,
                  duplicateArgCounts,
                  crossReferenceKeyList,
                  curDepth + 2,
                  true
                ).queryStr
            )
            .filter((cur) => Boolean(cur))
            .join("\n");

          /* Exclude empty unions */
          if (unionChildQuery) {
            queryStr += `${fragIndent}... on ${valueTypeName} {\n${unionChildQuery}\n${fragIndent}}\n`;
          }
        }
        queryStr += `${indent}}`;
      }
    }
    return { queryStr, argumentsDict };
  };

  /**
   * Generate the query for the specified field
   * @param obj one of the root objects(Query, Mutation, Subscription)
   * @param description description of the current object
   */
  const generateFile = (obj, description) => {
    let indexJs =
      "const fs = require('fs');\nconst path = require('path');\n\n";
    let outputFolderName;
    switch (true) {
      case /Mutation.*$/.test(description):
      case /mutation.*$/.test(description):
        outputFolderName = "mutations";
        break;
      case /Query.*$/.test(description):
      case /query.*$/.test(description):
        outputFolderName = "queries";
        break;
      case /Subscription.*$/.test(description):
      case /subscription.*$/.test(description):
        outputFolderName = "subscriptions";
        break;
      default:
        console.log(chalk.yellow("[gqlg warning]:", "description is required"));
    }
    const writeFolder = path.join(destDirPath, `./${outputFolderName}`);
    try {
      fs.mkdirSync(writeFolder);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    Object.keys(obj).forEach((type) => {
      const field = gqlSchema.getType(description).getFields()[type];
      /* Only process non-deprecated queries/mutations: */
      if (includeDeprecatedFields || !field.deprecationReason) {
        const queryResult = generateQuery(type, description);
        const varsToTypesStr = getVarsToTypesStr(queryResult.argumentsDict);
        let query = queryResult.queryStr;
        let queryName;
        switch (true) {
          case /Mutation/.test(description):
          case /mutation/.test(description):
            queryName = "mutation";
            break;
          case /Query/.test(description):
          case /query/.test(description):
            queryName = "query";
            break;
          case /Subscription/.test(description):
          case /subscription/.test(description):
            queryName = "subscription";
            break;
          default:
            break;
        }
        query = `gql\`${queryName || description.toLowerCase()} ${type}${
          varsToTypesStr ? `(${varsToTypesStr})` : ""
        }{\n${query}\n}\``;
        fs.writeFileSync(
          path.join(writeFolder, `./${type}.${fileExtension}`),
          query
        );
      }
    });
  };

  if (gqlSchema.getMutationType()) {
    generateFile(
      gqlSchema.getMutationType().getFields(),
      gqlSchema.getMutationType().name
    );
  } else {
    console.log(
      chalk.yellow("[gqlg warning]:", "No mutation type found in your schema")
    );
  }

  if (gqlSchema.getQueryType()) {
    generateFile(
      gqlSchema.getQueryType().getFields(),
      gqlSchema.getQueryType().name
    );
  } else {
    console.log(
      chalk.yellow("[gqlg warning]:", "No query type found in your schema")
    );
  }

  if (gqlSchema.getSubscriptionType()) {
    generateFile(
      gqlSchema.getSubscriptionType().getFields(),
      gqlSchema.getSubscriptionType().name
    );
  } else {
    console.log(
      chalk.yellow(
        "[gqlg warning]:",
        "No subscription type found in your schema"
      )
    );
  }
}
