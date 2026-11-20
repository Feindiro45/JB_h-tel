@extends('errors.layout', ['tone' => 'ko'])

@section('code', '500')
@section('title', 'Erreur interne')
@section('message', 'Une erreur inattendue est survenue de notre côté. Aucune donnée n’a été modifiée par cette erreur.')
@section('hint', 'Réessayez dans quelques instants ; si le problème persiste, contactez l’hôtel.')
@section('actions')
    <a class="primary" href="{{ url()->current() }}">Réessayer</a>
@endsection
