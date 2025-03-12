import * as crypto from 'crypto';

export interface Env {
	CLOUDKIT_PRIVATE_KEY: string;
	CLOUDKIT_KEY_ID: string;
	CLOUDKIT_CONTAINER: string;
	CLOUDKIT_ENVIRONMENT: string;
}

export async function cloudKitRequest(body: any, method: string, operationSubpath: string, env: Env) {
	const subpath = `/database/1/${env.CLOUDKIT_CONTAINER}/${env.CLOUDKIT_ENVIRONMENT}/${operationSubpath}`;
	const date = new Date().toISOString().replace(/\.[0-9]+?Z/, 'Z');
	const bodyHash = await hashBody(body);
	const message = `${date}:${bodyHash}:${subpath}`;
	const privateKey = await loadPrivateKey(env.CLOUDKIT_PRIVATE_KEY);
	const signature = await signMessage(privateKey, message);

	const headers = new Headers({
		'Content-Type': 'application/json',
		'X-Apple-CloudKit-Request-KeyID': env.CLOUDKIT_KEY_ID,
		'X-Apple-CloudKit-Request-ISO8601Date': date,
		'X-Apple-CloudKit-Request-SignatureV1': signature,
	});

	const options = {
		method,
		headers,
		body: JSON.stringify(body),
	};

	return await fetch(`https://api.apple-cloudkit.com${subpath}`, options);
}

const encoder = new TextEncoder();

async function hashBody(requestBody: any): Promise<string> {
	const encodedBody = encoder.encode(JSON.stringify(requestBody));
	const hashBuffer = await crypto.subtle.digest('SHA-256', encodedBody);
	return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

function toDERElement(component: Uint8Array): Uint8Array {
	let i = 0;
	while (i < component.length - 1 && component[i] === 0 && (component[i + 1] & 0x80) === 0) {
		i++;
	}
	const strippedComponent = component.slice(i);

	const leadingZero = (strippedComponent[0] & 0x80) !== 0;
	const length = strippedComponent.length + (leadingZero ? 1 : 0);
	const derElement = new Uint8Array(length + 2);

	derElement[0] = 0x02;
	derElement[1] = length;

	if (leadingZero) {
		derElement[2] = 0x00;
		derElement.set(strippedComponent, 3);
	} else {
		derElement.set(strippedComponent, 2);
	}

	return derElement;
}

function convertToDER(signature: Uint8Array): Uint8Array {
	const r = signature.slice(0, 32);
	const s = signature.slice(32, 64);
	const rDer = toDERElement(r);
	const sDer = toDERElement(s);

	const derSequenceLength = rDer.length + sDer.length + 2;
	const derArray = new Uint8Array(derSequenceLength);

	derArray[0] = 0x30;
	derArray[1] = rDer.length + sDer.length;

	derArray.set(rDer, 2);
	derArray.set(sDer, 2 + rDer.length);

	return derArray;
}

async function signMessage(privateKey: CryptoKey, message: string): Promise<string> {
	const encodedMessage = encoder.encode(message);
	const p1363Signature = await crypto.subtle.sign(
		{
			name: 'ECDSA',
			hash: { name: 'SHA-256' },
		},
		privateKey as crypto.webcrypto.CryptoKey,
		encodedMessage
	);

	const derSignature = convertToDER(new Uint8Array(p1363Signature));
	return btoa(String.fromCharCode(...new Uint8Array(derSignature)));
}

async function loadPrivateKey(pem: string): Promise<CryptoKey> {
	const binaryDer = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
	const importParams = {
		name: 'ECDSA',
		namedCurve: 'P-256',
	};
	return await crypto.subtle.importKey('pkcs8', binaryDer.buffer, importParams, true, ['sign']);
}
