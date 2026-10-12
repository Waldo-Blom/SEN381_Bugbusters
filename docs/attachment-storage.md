# FR-106: Service request image attachments

Requesters and operators can select images while submitting a service request. They can also add images later from their own request detail page, up to five images in total per request. Operators can open requests they logged from the Logged Requests table.

## Development configuration

Use the existing CivicConnect **development** branch and **civicconnect_dev** database. No migrations or schema changes are required.

Set these variables in your ignored local `.env` file:

```dotenv
AWS_ACCESS_KEY_ID=YOUR_DEVELOPMENT_STORAGE_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_DEVELOPMENT_STORAGE_SECRET_KEY
AWS_REGION=us-east-2
AWS_ENDPOINT_URL_S3=https://br-cold-queen-b59z51fw.storage.c-7.us-east-2.aws.neon.tech
STORAGE_BUCKET=civicconnect-attachments
```

Keep `DATABASE_URL` pointed at `civicconnect_dev` on the development branch. Use development storage credentials with permission to put, get, and delete objects in the existing private `civicconnect-attachments` bucket. Do not use the `assets` bucket from the generic SDK example. Leave the bucket private; no public access or browser CORS configuration is needed because Express uploads and signs downloads on the server.

Storage settings are resolved only when an image is uploaded or opened. Existing image-free request submissions work without storage credentials. Restart the application after updating `.env`.

Run `node db/scripts/check-attachment-storage.js` to verify the supplied development database columns and bucket access without modifying records or uploading files. This checks connectivity; the manual upload check below verifies object write/delete permissions.

## Upload and retrieval

- Accepted formats: JPEG, PNG, and WebP, with matching MIME type, extension, and file signature.
- Limit: five images per request and 5 MB per image, enforced on both incoming and stored image bytes.
- Images are decoded and re-encoded to remove metadata and appended content. Invalid image pixels are rejected. Decoding is limited to 40 million pixels.
- Objects use `requests/{request_id}/{generated_image_uuid}.{extension}`. JPEG keys use `.jpg`.
- `request_attachments.file_path` holds the object key; file size reflects the stored image. `uploaded_by` comes from the authenticated server-side identity, including the operator for operator-created requests.
- New requests and attachment metadata are saved in one PostgreSQL transaction after the request ID is returned. Failed storage or database writes trigger rollback and deletion of the batch's generated objects.
- Additional uploads lock the request row before checking the existing attachment count, preventing concurrent uploads from exceeding five images.
- If storage is unavailable during cleanup, the object key is logged for a later deletion retry. No credentials or signed URLs are logged by this feature.
- Listing attachments and opening an image both check the viewer's current database identity and request access. Requesters see their own requests; operators see requests they created; staff and managers retain department-based access.
- Operator access follows the existing server-side operator session, including demo operator accounts backed by active staff/admin users. Queries compare optional operator database roles as text so a database without an OPERATOR enum value continues to work without a schema change.
- Image links pass through an authenticated Express endpoint that redirects to a signed GET URL valid for 60 seconds. Attachment responses disable caching. A signed URL remains usable until it expires.

## Tests

The attachment unit and integration tests use real image decoding and mock object storage and PostgreSQL. They make no writes to Neon. The integration tests exercise multipart submission, metadata association, operator identity, protected retrieval, invalid images, upload limits, CSRF checks, transaction rollback, and object cleanup.

Run:

```shell
npm test -- --runInBand
npm run lint
npm run build:css
```

## Manual development check

1. Confirm the development database, private bucket, endpoint, and credentials are configured, then start the app.
2. Submit a requester request with a JPEG, PNG, and WebP image. Open its detail page and check the previews and full images.
3. Confirm each metadata row references the new request ID, records the authenticated uploader, and stores an object key rather than a URL.
4. Add more images from the detail page. Confirm the request cannot exceed five images.
5. Log a request as an operator with an image. Open it from Logged Requests and confirm the uploader is the operator.
6. Open the request as a staff member and manager from its department. Confirm images are visible. Check that another citizen and staff or management from another department cannot retrieve them.
7. Try an unsupported file, a damaged image, and an image larger than 5 MB. Confirm the form explains the problem and no request or attachment is saved for the failed submission.

The code does not provision storage, change database schemas, or deploy the application.

Upload failures show a safe error reference such as `ATT-PERMISSIONS`, `ATT-STORAGE-ACCESS`, `ATT-STORAGE-CONNECTION`, or `ATT-SAVE`. The server logs the stage and PostgreSQL/SDK code, without raw SQL or credentials. A server failure is displayed separately from a file-validation error and explains that the new request was not submitted.

References: [Neon Object Storage](https://neon.com/docs/storage/overview), [AWS S3 JavaScript SDK examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [Sharp input validation](https://sharp.pixelplumbing.com/api-constructor/).
