@extends('errors.layout', ['tone' => 'ko'])

@section('code')
{{ isset($exception) && method_exists($exception, 'getStatusCode') ? $exception->getStatusCode() : '500' }}
@endsection
@section('title', 'Service indisponible')
@section('message', 'Le serveur n’a pas pu répondre à votre demande.')
@section('hint', 'Réessayez dans quelques instants ; si le problème persiste, contactez l’hôtel.')
@section('actions')
    <a class="primary" href="{{ url()->current() }}">Réessayer</a>
@endsection
