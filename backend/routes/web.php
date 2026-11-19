<?php

use App\Modules\Billing\Http\Controllers\PublicVerificationController;
use Illuminate\Support\Facades\Route;

// Le backend est une API : l'interface est servie par l'application frontend distincte.
Route::get('/', fn () => response()->json([
    'application' => config('app.name'),
    'api' => url('/api/v1'),
]));

// Vérification publique des factures (adresse du QR code, D-036) : sans connexion, débit limité.
Route::get('verification/factures/{invoice}', [PublicVerificationController::class, 'page'])
    ->middleware('throttle:30,1')
    ->name('public.invoices.verify');
