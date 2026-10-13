import { MongoClient, MongoClientOptions, Db } from "mongodb";
import path from "path";
import fs from "fs";

export type StringDoc = { _id: string; [key: string]: any };

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing MongoDB environment variable: ${name}`);
  return val;
}

function buildMongoClient(): MongoClient {
	const connectionString = process.env.MONGODB_URI;
	let url = connectionString;
	if (!url) {
		const host = requireEnv("MONGODB_HOST");
		const port = requireEnv("MONGODB_PORT");
		const username = requireEnv("MONGODB_USERNAME");
		const password = requireEnv("MONGODB_PASSWORD");
		url = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
	}

  const tlsEnabled = process.env.MONGODB_TLS === "true";
  const caFile = process.env.MONGODB_CA_FILE;
  const certKeyFile = process.env.MONGODB_CERT_KEY_FILE;

  const configuredTimeout = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS);
  const serverSelectionTimeoutMS = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
    ? Math.floor(configuredTimeout)
    : 5000;
  const options: MongoClientOptions = {
    serverSelectionTimeoutMS,
    connectTimeoutMS: serverSelectionTimeoutMS,
  };

  if (tlsEnabled) {
    if (!caFile)
      throw new Error("Missing MongoDB environment variable: MONGODB_CA_FILE");
    if (!certKeyFile)
      throw new Error(
        "Missing MongoDB environment variable: MONGODB_CERT_KEY_FILE"
      );

    const resolvedCaFile = path.resolve(process.cwd(), caFile);
    const resolvedCertKeyFile = path.resolve(process.cwd(), certKeyFile);

    if (!fs.existsSync(resolvedCaFile))
      throw new Error(`MongoDB CA file not found: ${resolvedCaFile}`);
    if (!fs.existsSync(resolvedCertKeyFile))
      throw new Error(
        `MongoDB certificate key file not found: ${resolvedCertKeyFile}`
      );

    options.tls = true;
    options.tlsCAFile = resolvedCaFile;
    options.tlsCertificateKeyFile = resolvedCertKeyFile;
  }

	return new MongoClient(url, options);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const client = buildMongoClient();
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise!;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DATABASE || "workspace");
}

// Same cluster and credentials as getMongoDb(), with an optional database
// override for deployments that separate conversation history.
export async function getMongoAiDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DATABASE_AI || "workspace_ai");
}
