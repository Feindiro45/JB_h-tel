@extends('errors.layout', ['tone' => 'info'])

@section('code', '419')
@section('title', 'Page expirée')
@section('message', 'Votre session a expiré par sécurité, après un moment d’inactivité.')
@section('hint', 'Rechargez la page puis recommencez votre opération.')
@section('actions')
    <a class="primary" href="{{ url()->current() }}">Réessayer</a>
@endsection
