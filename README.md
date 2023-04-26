# generate-graphql-gql

Generate queries from graphql schema, used for writing api test.

## Example

```gql
# Sample schema
type Query {
  user(id: Int!): User!
}

type User {
  id: Int!
  username: String!
  email: String!
  createdAt: String!
}
```

```gql
# Sample query generated
query user($id: Int!) {
  user(id: $id) {
    id
    username
    email
    createdAt
  }
}
```

## Usage

```bash
# Install
npm install -d generate-graphql-gql (not tested yet)

# see the usage
gqlg --help

# Generate sample queries from schema file
gqlg --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output --depthLimit 5
```
