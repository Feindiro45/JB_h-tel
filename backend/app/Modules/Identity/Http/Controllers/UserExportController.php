<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Http\Exports\UsersExport;
use App\Modules\Identity\Http\Requests\UserListRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel des utilisateurs, avec les filtres de l'écran. */
final class UserExportController
{
    public function __invoke(UserListRequest $request, UsersExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(UsersExport::MODULE));
    }
}
