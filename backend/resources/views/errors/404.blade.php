@extends('errors.layout', ['tone' => 'warn'])

@section('code', '404')
@section('title', 'Page introuvable')
@section('message', 'La page demandée n’existe pas ou a été déplacée.')
@section('hint', 'Vérifiez l’adresse saisie, ou scannez de nouveau le QR code de votre document.')
@section('actions')
@endsection
