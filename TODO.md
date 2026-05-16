# TODO - Add Book Covers

- [x] Update DB schema: add `books.cover_url` column.

- [x] Update backend (`server.js`).

  - [ ] Add multer upload for cover images under `uploads/books/`.
  - [ ] Extend `POST /api/books` to accept optional multipart field `cover` and store `cover_url`.
- [x] Update frontend teacher UI (`teacherBooksLessons.jsx`).

- [x] Add cover file input to “Create New Book” modal.

- [x] Submit create request as `multipart/form-data`.

- [x] Display cover thumbnails in teacher books grid.

- [x] Update frontend student UI (`booksLessons.jsx`).

- [x] Display cover thumbnails in books grid.

- [x] Update frontend book content (`booksContent.jsx`) (optional but included).
  - [x] Display cover in header area.

- [ ] Manual testing steps:

  - [ ] Start backend + create a book with cover.

  - [ ] Verify cover saved and shown on teacher + student pages.
  - [ ] Verify behavior when no cover is uploaded.

