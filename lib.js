import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import {
  introspectionQuery,
  buildClientSchema,
  printSchema,
} from "graphql/utilities/index.js";
import * as query from "querystringify";

/**
 *
 * Normalizes header input from CLI
 *
 * @param cli
 */
export function getHeadersFromInput(cli) {
  switch (typeof cli.flags.header) {
    case "string": {
      const keys = query.parse(cli.flags.header);
      const key = Object.keys(keys)[0];
      return [{ key: key, value: keys[key] }];
    }
    case "object": {
      return cli.flags.header.map((header) => {
        const keys = query.parse(header);
        const key = Object.keys(keys)[0];
        return { key: key, value: keys[key] };
      });
    }
    default: {
      return [];
    }
  }
}

/**
 *
 * Fetch remote schema and turn it into string
 *
 * @param endpoint
 * @param options
 */
export async function getRemoteSchema(endpoint, options) {
  try {
    const { data, errors } = await fetch(endpoint, {
      method: options.method,
      headers: options.headers,
      body: JSON.stringify({ query: introspectionQuery }),
    }).then((res) => res.json());

    if (errors) {
      return { status: "err", message: JSON.stringify(errors, null, 2) };
    }

    if (options.json) {
      return {
        status: "ok",
        schema: JSON.stringify(data, null, 2),
      };
    } else {
      const schema = buildClientSchema(data);
      return {
        status: "ok",
        schema: printSchema(schema),
      };
    }
  } catch (err) {
    return { status: "err", message: err.message };
  }
}

/**
 *
 * Prints schema to file.
 *
 * @param dist
 * @param schema
 */
export function printToFile(dist, schema) {
  try {
    const output = path.resolve(process.cwd(), dist);

    if (!fs.existsSync(output)) {
      fs.mkdirSync(output);
    }
    fs.writeFileSync(path.join(output, `shema.graphql`), schema);

    return { status: "ok", path: output };
  } catch (err) {
    return { status: "err", message: err.message };
  }
}
