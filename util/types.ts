export type Term = {
  type: string;
  value: string;
};

export type Quad = {
  subject: Term;
  predicate: Term;
  object: Term;
  graph: Term;
};

export type Changeset = {
  inserts: Quad[];
  deletes: Quad[];
};

export type SparqlResult = {
  results: { bindings: Array<Quad> };
  boolean?: boolean;
};
