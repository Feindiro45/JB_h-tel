<?php

use Illuminate\Support\Facades\Route;

// Le backend est une API : l'interface est servie par l'application frontend distincte.
Route::get('/', fn () => response()->json([
    'application' => config('app.name'),
    'api' => url('/api/v1'),
]));
