<?php

use App\Modules\Billing\Http\Controllers\PublicVerificationController;
use App\Modules\Customers\Http\Controllers\PublicUnsubscribeController;
use Illuminate\Support\Facades\Route;

// Le backend est une API : l'interface est servie par l'application frontend distincte.
Route::get('/', fn () => response()->json([
    'application' => config('app.name'),
    'api' => url('/api/v1'),
]));

// Désinscription des e-mails (lien signé présent dans chaque message, D-039) : sans connexion.
Route::get('notifications/desinscription/{customer}', PublicUnsubscribeController::class)
    ->middleware(['signed', 'throttle:30,1'])
    ->name('public.customers.unsubscribe');

// Vérification publique des factures (adresse du QR code, D-038) : sans connexion, débit limité.
Route::get('verification/factures/{invoice}', [PublicVerificationController::class, 'page'])
    ->middleware('throttle:30,1')
    ->name('public.invoices.verify');
