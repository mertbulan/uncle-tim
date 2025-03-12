import jsonwebtoken from 'jsonwebtoken';
import { cloudKitRequest } from './cloudKitRequest';
import { Env } from './cloudKitRequest';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const jsonData: any = await request.json();
		const decodedJson: any = jsonwebtoken.decode(jsonData['signedPayload']);
		const data: any = decodedJson['data'];
		const bundleId: string | null = data['bundleId'];
		const transactionInfo: any = jsonwebtoken.decode(data['signedTransactionInfo']);
		const notificationType: string | null = decodedJson['notificationType'];
		const subtype: string | null = decodedJson['subtype'];
		const signedDate: number | null = decodedJson['signedDate'];

		// Uncomment this if you don't want to receive a notification in Sandbox environment
		if (data['environment'] == 'Sandbox') {
			return new Response(null, { status: 200 });
		}

		console.log('Decoded JSON:', decodedJson);

		let title = `${notificationType}${subtype ? ` · ${subtype}` : ''}`;
		let content = '';

		console.log('Decoded Transaction Info:', transactionInfo);

		if (transactionInfo) {
			const productId: string | null = transactionInfo['productId'];
			const currency: string | null = transactionInfo['currency'];
			const price: number | null = transactionInfo['price'];
			const storefront: string | null = transactionInfo['storefront'];
			const amount = price ? `${(price / 1000).toFixed(2)} ${currency}` : `0.00 ${currency}`;

			content = `${amount} · ${productId} · ${bundleId} · ${storefront}`;
		}

		const response = await cloudKitRequest(
			{
				operations: [
					{
						operationType: 'create',
						record: {
							recordType: 'Notification',
							fields: {
								title: { value: title },
								content: { value: content },
								date: { value: signedDate },
							},
						},
					},
				],
			},
			'POST',
			'public/records/modify',
			env
		);

		const { contentType, result } = await gatherResponse(response);
		const options = { headers: { 'content-type': contentType } };
		return new Response(result as string, options);
	},
} satisfies ExportedHandler<Env>;

async function gatherResponse(response: Response) {
	const { headers } = response;
	const contentType = headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return { contentType, result: JSON.stringify(await response.json()) };
	}
	return { contentType, result: response.text() };
}
