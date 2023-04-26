# generate-graphql-gql

Generate queries from graphql schema.

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
agql --help

# Generate sample queries from schema file
agql -u 'url-to-schem'  -f "./example-folder-output/" -e "extension"
agql -u https://graphql-demo.mead.io/ -f graph -e ts
```
